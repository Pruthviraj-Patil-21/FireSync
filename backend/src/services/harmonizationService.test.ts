import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  HarmonizationService,
  assignSpatialGridCell,
  prepareHarmonizationInputs,
  runHarmonizationAlgorithm,
  escapeCsvValue
} from './harmonizationService';

function createMockHarmonizationDb(seedObs: any[] = []) {
  const runs = new Map<string, any>();
  const matches = new Map<string, any>();
  const dailySummaries = new Map<string, any>();
  const obsMap = new Map<string, any>(seedObs.map((o) => [o.id, o]));
  let seq = 1;

  const dbClient: any = {
    fireObservation: {
      findMany: async () => seedObs
    },
    harmonizationRun: {
      create: async (args: any) => {
        const created = { id: `run_${seq++}`, createdAt: new Date(), ...args.data };
        runs.set(created.id, created);
        return created;
      },
      update: async (args: any) => {
        const existing = runs.get(args.where.id);
        const updated = { ...existing, ...args.data };
        runs.set(args.where.id, updated);
        return updated;
      },
      findFirst: async () => Array.from(runs.values())[0] || null,
      findMany: async () => Array.from(runs.values()),
      findUnique: async (args: any) => runs.get(args.where.id) || null
    },
    harmonizedObservationMatch: {
      upsert: async (args: any) => {
        const key = `${args.where.runId_matchKey.runId}:${args.where.runId_matchKey.matchKey}`;
        if (matches.has(key)) return matches.get(key);
        const created = { id: `match_${seq++}`, ...args.create };
        matches.set(key, created);
        return created;
      },
      findMany: async () => {
        return Array.from(matches.values()).map((m) => ({
          ...m,
          modisObservation: m.modisObservationId ? obsMap.get(m.modisObservationId) || null : null,
          viirsObservation: m.viirsObservationId ? obsMap.get(m.viirsObservationId) || null : null
        }));
      },
      count: async () => matches.size
    },
    harmonizedDailySummary: {
      upsert: async (args: any) => {
        const key = `${args.where.runId_date.runId}:${args.where.runId_date.date.toISOString()}`;
        if (dailySummaries.has(key)) return dailySummaries.get(key);
        const created = { id: `day_${seq++}`, ...args.create };
        dailySummaries.set(key, created);
        return created;
      },
      findMany: async () => Array.from(dailySummaries.values())
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
    _state: { runs, matches, dailySummaries, obsMap }
  };

  return dbClient;
}

describe('HarmonizationService Unit & Algorithm Tests', () => {
  test('Common spatial grid assigns deterministic Equal Earth cell IDs unambiguous across resolutions', () => {
    const cell1km = assignSpatialGridCell(23.2, 78.5, 1000);
    const cell500m = assignSpatialGridCell(23.2, 78.5, 500);
    const cell250m = assignSpatialGridCell(23.2, 78.5, 250);

    assert.ok(cell1km.cellId.startsWith('EE_1000M_'));
    assert.ok(cell500m.cellId.startsWith('EE_500M_'));
    assert.ok(cell250m.cellId.startsWith('EE_250M_'));
    assert.notStrictEqual(cell1km.cellId, cell500m.cellId);
    assert.notStrictEqual(cell500m.cellId, cell250m.cellId);
  });

  test('1. Matches MODIS and VIIRS observations within spatial (1500m) and temporal (60m) thresholds', () => {
    const obs = [
      {
        id: 'modis-1',
        sensor: 'MODIS',
        satellitePlatform: 'Aqua',
        latitude: 23.2000,
        longitude: 78.5000,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        frp: 45.0,
        brightnessTemp: 330.0,
        confidence: 88,
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'viirs-1',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 23.2050, // ~555m north
        longitude: 78.5040, // ~408m east -> total ~689m <= 1500m
        observationTime: new Date('2026-04-10T08:25:00.000Z'), // 25m <= 60m
        frp: 52.0,
        brightnessTemp: 342.0,
        confidence: null,
        confidenceRaw: 'h',
        confidenceCategory: 'HIGH',
        sourceDataset: 'VIIRS_NOAA20_NRT'
      }
    ];

    const res = runHarmonizationAlgorithm(obs, { spatialDistanceM: 1500, timeWindowMinutes: 60 });
    assert.strictEqual(res.candidateMatchCount, 1);
    assert.strictEqual(res.modisOnlyCount, 0);
    assert.strictEqual(res.viirsOnlyCount, 0);

    const match = res.matches[0];
    assert.strictEqual(match.matchClass, 'CANDIDATE_MATCH');
    assert.strictEqual(match.modisObservationId, 'modis-1');
    assert.strictEqual(match.viirsObservationId, 'viirs-1');
    assert.ok(match.distanceM !== null && match.distanceM < 1000);
    assert.strictEqual(match.timeDiffMinutes, 25);
    assert.ok(match.matchScore !== null && match.matchScore > 0.5 && match.matchScore <= 1);
  });

  test('2. Observations outside spatial or temporal thresholds remain unmatched', () => {
    const obs = [
      {
        id: 'm-1',
        sensor: 'MODIS',
        satellitePlatform: 'Aqua',
        latitude: 23.2000,
        longitude: 78.5000,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'v-far-space',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 23.2500, // ~5.5 km away (> 1500m)
        longitude: 78.5000,
        observationTime: new Date('2026-04-10T08:10:00.000Z'),
        sourceDataset: 'VIIRS_NOAA20_NRT'
      },
      {
        id: 'v-far-time',
        sensor: 'VIIRS',
        satellitePlatform: 'Suomi-NPP',
        latitude: 23.2005, // ~55m away
        longitude: 78.5000,
        observationTime: new Date('2026-04-10T10:30:00.000Z'), // 150 min (> 60m)
        sourceDataset: 'VIIRS_SNPP_NRT'
      }
    ];

    const res = runHarmonizationAlgorithm(obs, { spatialDistanceM: 1500, timeWindowMinutes: 60 });
    assert.strictEqual(res.candidateMatchCount, 0);
    assert.strictEqual(res.modisOnlyCount, 1);
    assert.strictEqual(res.viirsOnlyCount, 2);
  });

  test('3 & 4. Handles MODIS-only and VIIRS-only datasets cleanly', () => {
    const modisOnlyRes = runHarmonizationAlgorithm([
      {
        id: 'm-only',
        sensor: 'MODIS',
        satellitePlatform: 'Terra',
        latitude: 21.1,
        longitude: 79.1,
        observationTime: new Date('2026-04-10T05:00:00.000Z'),
        sourceDataset: 'MODIS_NRT'
      }
    ]);
    assert.strictEqual(modisOnlyRes.candidateMatchCount, 0);
    assert.strictEqual(modisOnlyRes.modisOnlyCount, 1);
    assert.strictEqual(modisOnlyRes.viirsOnlyCount, 0);

    const viirsOnlyRes = runHarmonizationAlgorithm([
      {
        id: 'v-only',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-21',
        latitude: 21.1,
        longitude: 79.1,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        sourceDataset: 'VIIRS_NOAA21_NRT'
      }
    ]);
    assert.strictEqual(viirsOnlyRes.candidateMatchCount, 0);
    assert.strictEqual(viirsOnlyRes.modisOnlyCount, 0);
    assert.strictEqual(viirsOnlyRes.viirsOnlyCount, 1);
  });

  test('5. Missing FRP and confidence remain null and VIIRS categorical confidence is never numeric', () => {
    const obs = [
      {
        id: 'm-null',
        sensor: 'MODIS',
        satellitePlatform: 'Terra',
        latitude: 22.0,
        longitude: 78.0,
        observationTime: new Date('2026-04-10T05:00:00.000Z'),
        frp: null,
        brightnessTemp: null,
        confidence: null,
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'v-cat',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 22.001,
        longitude: 78.001,
        observationTime: new Date('2026-04-10T05:10:00.000Z'),
        frp: null,
        brightnessTemp: null,
        confidence: null,
        confidenceRaw: 'n',
        confidenceCategory: 'NOMINAL',
        sourceDataset: 'VIIRS_NOAA20_NRT'
      }
    ];

    const res = runHarmonizationAlgorithm(obs);
    const match = res.matches[0];
    assert.strictEqual(match.modisObservation?.frp, null);
    assert.strictEqual(match.modisObservation?.brightnessTemp, null);
    assert.strictEqual(match.modisObservation?.confidence, null);
    assert.strictEqual(match.viirsObservation?.confidence, null);
    assert.strictEqual(match.viirsObservation?.confidenceRaw, 'n');
    assert.strictEqual(match.viirsObservation?.confidenceCategory, 'NOMINAL');

    const day = res.dailySummaries[0];
    assert.strictEqual(day.modisValidFrpCount, 0);
    assert.strictEqual(day.modisFrpSumMw, null);
    assert.strictEqual(day.viirsValidFrpCount, 0);
    assert.strictEqual(day.viirsFrpSumMw, null);
    assert.strictEqual(day.estimatedBurnedAreaHa, null);
  });

  test('6 & 7. Invalid timestamps/coordinates and duplicate observations are rejected/deduplicated', () => {
    const { prepared, rejectedCount } = prepareHarmonizationInputs([
      {
        id: 'valid-1',
        sourceId: 'src-1',
        sensor: 'MODIS',
        latitude: 23.0,
        longitude: 78.0,
        observationTime: new Date('2026-04-10T05:00:00.000Z'),
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'valid-1', // duplicate ID
        sourceId: 'src-1',
        sensor: 'MODIS',
        latitude: 23.0,
        longitude: 78.0,
        observationTime: new Date('2026-04-10T05:00:00.000Z'),
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'dup-source-id',
        sourceId: 'src-1', // duplicate sourceId
        sensor: 'MODIS',
        latitude: 23.0,
        longitude: 78.0,
        observationTime: new Date('2026-04-10T05:00:00.000Z'),
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'bad-coords',
        sensor: 'VIIRS',
        latitude: 95.0,
        longitude: 78.0,
        observationTime: new Date('2026-04-10T05:00:00.000Z')
      },
      {
        id: 'bad-time',
        sensor: 'VIIRS',
        latitude: 23.0,
        longitude: 78.0,
        observationTime: 'not-a-date'
      }
    ]);

    assert.strictEqual(prepared.length, 1);
    assert.strictEqual(rejectedCount, 4);
  });

  test('8. One-to-one matching prevents double-matching and pairs closest candidate', () => {
    const obs = [
      {
        id: 'm-center',
        sensor: 'MODIS',
        satellitePlatform: 'Aqua',
        latitude: 23.2000,
        longitude: 78.5000,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'v-closest',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 23.2010, // ~111m
        longitude: 78.5000,
        observationTime: new Date('2026-04-10T08:05:00.000Z'), // 5m
        sourceDataset: 'VIIRS_NOAA20_NRT'
      },
      {
        id: 'v-second',
        sensor: 'VIIRS',
        satellitePlatform: 'Suomi-NPP',
        latitude: 23.2080, // ~889m
        longitude: 78.5000,
        observationTime: new Date('2026-04-10T08:20:00.000Z'), // 20m
        sourceDataset: 'VIIRS_SNPP_NRT'
      }
    ];

    const res = runHarmonizationAlgorithm(obs);
    assert.strictEqual(res.candidateMatchCount, 1);
    assert.strictEqual(res.modisOnlyCount, 0);
    assert.strictEqual(res.viirsOnlyCount, 1);

    const matched = res.matches.find((m) => m.matchClass === 'CANDIDATE_MATCH')!;
    const unmatched = res.matches.find((m) => m.matchClass === 'VIIRS_ONLY')!;
    assert.strictEqual(matched.viirsObservationId, 'v-closest');
    assert.strictEqual(unmatched.viirsObservationId, 'v-second');
  });

  test('9. Empty dataset produces zero counts and empty daily summaries without error', () => {
    const res = runHarmonizationAlgorithm([]);
    assert.strictEqual(res.totalInputObservations, 0);
    assert.strictEqual(res.validModisCount, 0);
    assert.strictEqual(res.validViirsCount, 0);
    assert.strictEqual(res.candidateMatchCount, 0);
    assert.strictEqual(res.matches.length, 0);
    assert.strictEqual(res.dailySummaries.length, 0);
  });

  test('10. Daily aggregation conserves counts and persists cleanly via mocked Prisma', async () => {
    const seedObs = [
      {
        id: 'm1',
        sensor: 'MODIS',
        satellitePlatform: 'Aqua',
        latitude: 23.2,
        longitude: 78.5,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        frp: 30.0,
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'v1',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 23.202,
        longitude: 78.502,
        observationTime: new Date('2026-04-10T08:15:00.000Z'),
        frp: 22.0,
        confidenceRaw: 'h',
        confidenceCategory: 'HIGH',
        sourceDataset: 'VIIRS_NOAA20_NRT'
      },
      {
        id: 'v2',
        sensor: 'VIIRS',
        satellitePlatform: 'Suomi-NPP',
        latitude: 24.5,
        longitude: 79.5,
        observationTime: new Date('2026-04-11T08:15:00.000Z'),
        frp: 15.0,
        confidenceRaw: 'n',
        confidenceCategory: 'NOMINAL',
        sourceDataset: 'VIIRS_SNPP_NRT'
      }
    ];

    const dbClient = createMockHarmonizationDb(seedObs);
    const runOutput = await HarmonizationService.executeHarmonizationRun(
      { regionName: 'Central India Test', spatialDistanceM: 1500, timeWindowMinutes: 60 },
      dbClient
    );

    assert.strictEqual(runOutput.run.status, 'COMPLETED');
    assert.strictEqual(runOutput.summary.candidateMatchCount + runOutput.summary.modisOnlyCount, runOutput.summary.validModisCount);
    assert.strictEqual(runOutput.summary.candidateMatchCount + runOutput.summary.viirsOnlyCount, runOutput.summary.validViirsCount);
    assert.strictEqual(runOutput.dailySummaries.length, 2);
    assert.strictEqual(runOutput.dailySummaries[0].modisFrpSumMw, 30);
    assert.strictEqual(runOutput.dailySummaries[0].viirsFrpSumMw, 22);
    assert.strictEqual(runOutput.dailySummaries[0].estimatedBurnedAreaHa, null);
    assert.strictEqual(dbClient._state.matches.size, 2);
    assert.strictEqual(dbClient._state.dailySummaries.size, 2);
  });

  test('11. escapeCsvValue correctly escapes commas, quotes, and newlines per RFC 4180', () => {
    assert.strictEqual(escapeCsvValue('Simple'), 'Simple');
    assert.strictEqual(escapeCsvValue(123.45), '123.45');
    assert.strictEqual(escapeCsvValue(null), '');
    assert.strictEqual(escapeCsvValue(undefined), '');
    assert.strictEqual(escapeCsvValue('Hello, World'), '"Hello, World"');
    assert.strictEqual(escapeCsvValue('Contains "Quotes"'), '"Contains ""Quotes"""');
    assert.strictEqual(escapeCsvValue('Line 1\nLine 2'), '"Line 1\nLine 2"');
  });

  test('12. exportMatchesToCsv outputs RFC 4180 CSV with mandatory headers and observation values', async () => {
    const seedObs = [
      {
        id: 'm1',
        sensor: 'MODIS',
        satellitePlatform: 'Aqua',
        latitude: 23.2,
        longitude: 78.5,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        frp: 30.0,
        brightnessTemp: 325.5,
        confidence: 90,
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'v1',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 23.202,
        longitude: 78.502,
        observationTime: new Date('2026-04-10T08:15:00.000Z'),
        frp: 22.0,
        brightnessTemp: 338.2,
        confidenceRaw: 'h',
        confidenceCategory: 'HIGH',
        sourceDataset: 'VIIRS_NOAA20_NRT'
      }
    ];

    const dbClient = createMockHarmonizationDb(seedObs);
    const runOutput = await HarmonizationService.executeHarmonizationRun(
      { regionName: 'Export Test', spatialDistanceM: 1500, timeWindowMinutes: 60 },
      dbClient
    );

    const csv = await HarmonizationService.exportMatchesToCsv({ runId: runOutput.run.id }, dbClient);
    assert.ok(csv.startsWith('observation_id,sensor,satellite,observation_time_utc,latitude,longitude,match_class,grid_cell_id,distance_m,time_diff_minutes,match_score,frp_mw,brightness_temp_k,confidence,source_dataset'));
    assert.ok(csv.includes('MODIS'));
    assert.ok(csv.includes('VIIRS'));
    assert.ok(csv.includes('CANDIDATE_MATCH'));
    assert.ok(csv.includes('MODIS_NRT'));
    assert.ok(csv.includes('VIIRS_NOAA20_NRT'));
  });

  test('13. exportMatchesToGeoJson outputs valid GeoJSON FeatureCollection with Point coordinates and properties', async () => {
    const seedObs = [
      {
        id: 'm1',
        sensor: 'MODIS',
        satellitePlatform: 'Aqua',
        latitude: 23.2,
        longitude: 78.5,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        frp: 30.0,
        brightnessTemp: 325.5,
        confidence: 90,
        sourceDataset: 'MODIS_NRT'
      },
      {
        id: 'v1',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 23.202,
        longitude: 78.502,
        observationTime: new Date('2026-04-10T08:15:00.000Z'),
        frp: 22.0,
        brightnessTemp: 338.2,
        confidenceRaw: 'h',
        confidenceCategory: 'HIGH',
        sourceDataset: 'VIIRS_NOAA20_NRT'
      }
    ];

    const dbClient = createMockHarmonizationDb(seedObs);
    const runOutput = await HarmonizationService.executeHarmonizationRun(
      { regionName: 'GeoJSON Test', spatialDistanceM: 1500, timeWindowMinutes: 60 },
      dbClient
    );

    const geojson = await HarmonizationService.exportMatchesToGeoJson({ runId: runOutput.run.id }, dbClient);
    assert.strictEqual(geojson.type, 'FeatureCollection');
    assert.ok(Array.isArray(geojson.features));
    assert.strictEqual(geojson.features.length, 2);

    const feat0 = geojson.features[0];
    assert.strictEqual(feat0.type, 'Feature');
    assert.strictEqual(feat0.geometry.type, 'Point');
    assert.strictEqual(feat0.geometry.coordinates[0], 78.5); // lon
    assert.strictEqual(feat0.geometry.coordinates[1], 23.2); // lat
    assert.strictEqual(feat0.properties.matchClass, 'CANDIDATE_MATCH');
    assert.strictEqual(feat0.properties.sensor, 'MODIS');

    const feat1 = geojson.features[1];
    assert.strictEqual(feat1.type, 'Feature');
    assert.strictEqual(feat1.geometry.type, 'Point');
    assert.strictEqual(feat1.geometry.coordinates[0], 78.502); // lon
    assert.strictEqual(feat1.geometry.coordinates[1], 23.202); // lat
    assert.strictEqual(feat1.properties.sensor, 'VIIRS');
  });

  test('14. exportDailySummariesToCsv outputs RFC 4180 CSV with daily activity headers and aggregated metrics', async () => {
    const seedObs = [
      {
        id: 'm1',
        sensor: 'MODIS',
        satellitePlatform: 'Terra',
        latitude: 23.2,
        longitude: 78.5,
        observationTime: new Date('2026-04-10T08:00:00.000Z'),
        frp: 30.0,
        sourceDataset: 'MODIS_NRT'
      }
    ];

    const dbClient = createMockHarmonizationDb(seedObs);
    const runOutput = await HarmonizationService.executeHarmonizationRun(
      { regionName: 'Daily CSV Test', spatialDistanceM: 1500, timeWindowMinutes: 60 },
      dbClient
    );

    const csv = await HarmonizationService.exportDailySummariesToCsv({ runId: runOutput.run.id }, dbClient);
    assert.ok(csv.startsWith('date_utc,region_name,modis_count,viirs_count,candidate_match_count,modis_only_count,viirs_only_count,unique_grid_cells,modis_frp_sum_mw,modis_frp_mean_mw,modis_frp_max_mw,viirs_frp_sum_mw,viirs_frp_mean_mw,viirs_frp_max_mw'));
    assert.ok(csv.includes('Daily CSV Test'));
    assert.ok(csv.includes('2026-04-10'));
  });

  test('15. Export functions handle empty/unfound runs gracefully', async () => {
    const dbClient = createMockHarmonizationDb([]);
    const csvMatches = await HarmonizationService.exportMatchesToCsv({ runId: 'nonexistent' }, dbClient);
    assert.ok(csvMatches.startsWith('observation_id,sensor'));

    const geojson = await HarmonizationService.exportMatchesToGeoJson({ runId: 'nonexistent' }, dbClient);
    assert.strictEqual(geojson.type, 'FeatureCollection');
    assert.strictEqual(geojson.features.length, 0);

    const csvDaily = await HarmonizationService.exportDailySummariesToCsv({ runId: 'nonexistent' }, dbClient);
    assert.ok(csvDaily.startsWith('date_utc,region_name'));
  });

  test('16. Null FRP vs genuine zero FRP: CSV exports empty string for null, "0" for zero; GeoJSON preserves null vs 0', async () => {
    const seedObs = [
      {
        id: 'obs-null-frp',
        sensor: 'VIIRS',
        satellitePlatform: 'NOAA-20',
        latitude: 20.0,
        longitude: 75.0,
        observationTime: new Date('2026-04-10T10:00:00.000Z'),
        frp: null,
        brightnessTemp: 310.0,
        confidenceRaw: 'n',
        confidenceCategory: 'NOMINAL',
        sourceDataset: 'VIIRS_NOAA20_NRT'
      },
      {
        id: 'obs-zero-frp',
        sensor: 'MODIS',
        satellitePlatform: 'Terra',
        latitude: 20.01,
        longitude: 75.01,
        observationTime: new Date('2026-04-10T10:05:00.000Z'),
        frp: 0,
        brightnessTemp: 312.0,
        confidence: 80,
        sourceDataset: 'MODIS_NRT'
      }
    ];

    const dbClient = createMockHarmonizationDb(seedObs);
    const runOutput = await HarmonizationService.executeHarmonizationRun(
      { regionName: 'Null Zero FRP Test', spatialDistanceM: 2000, timeWindowMinutes: 60 },
      dbClient
    );

    // CSV Matches Export
    const csv = await HarmonizationService.exportMatchesToCsv({ runId: runOutput.run.id }, dbClient);
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    // Find lines for both observations
    const nullLine = lines.find(l => l.startsWith('obs-null-frp'));
    const zeroLine = lines.find(l => l.startsWith('obs-zero-frp'));

    assert.ok(nullLine, 'Must include obs-null-frp');
    assert.ok(zeroLine, 'Must include obs-zero-frp');

    // frp_mw is the 12th column (index 11) in the CSV schema
    // observation_id(0), sensor(1), satellite(2), observation_time_utc(3), latitude(4), longitude(5), match_class(6), grid_cell_id(7), distance_m(8), time_diff_minutes(9), match_score(10), frp_mw(11)
    const nullCols = nullLine.split(',');
    const zeroCols = zeroLine.split(',');

    assert.strictEqual(nullCols[11], '', 'Null FRP must export as empty string, never 0 or fabricated value');
    assert.strictEqual(zeroCols[11], '0', 'Zero FRP must export as "0", preserving genuine measured 0');

    // GeoJSON Matches Export
    const geojson = await HarmonizationService.exportMatchesToGeoJson({ runId: runOutput.run.id }, dbClient);
    const nullFeature = geojson.features.find((f: any) => f.properties.observationId === 'obs-null-frp');
    const zeroFeature = geojson.features.find((f: any) => f.properties.observationId === 'obs-zero-frp');

    assert.ok(nullFeature, 'Must include nullFeature');
    assert.ok(zeroFeature, 'Must include zeroFeature');
    assert.strictEqual(nullFeature.properties.frp, null, 'GeoJSON must keep null FRP as null');
    assert.strictEqual(zeroFeature.properties.frp, 0, 'GeoJSON must keep genuine zero FRP as 0');
  });
});

