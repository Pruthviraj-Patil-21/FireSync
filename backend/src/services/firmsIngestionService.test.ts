import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  FirmsIngestionService,
  buildFirmsRequestUrl,
  haversineDistanceKm,
  identifyFirmsSensorAndPlatform,
  parseFirmsAcquisitionTimestamp,
  parseFirmsConfidence,
  parseFirmsCsv
} from './firmsIngestionService';
import { classifyLocation } from './fireService';

function createMockDbClient() {
  const observations = new Map<string, any>();
  const incidents = new Map<string, any>();
  const ingestionLogs: any[] = [];
  let seq = 1;

  const dbClient: any = {
    fireObservation: {
      findMany: async (args: any = {}) => {
        const all = Array.from(observations.values());
        if (args.where?.sourceId?.in) {
          const set = new Set(args.where.sourceId.in);
          return all.filter((r) => set.has(r.sourceId));
        }
        if (args.where?.id?.in) {
          const set = new Set(args.where.id.in);
          return all.filter((r) => set.has(r.id));
        }
        return all;
      },
      upsert: async (args: any) => {
        const key = args.where.sourceId;
        const existing = observations.get(key);
        if (existing) {
          const updated = { ...existing, ...args.update };
          observations.set(key, updated);
          return updated;
        }
        const created = {
          id: `obs_${seq++}`,
          ingestedAt: new Date(),
          incidentId: null,
          ...args.create
        };
        observations.set(key, created);
        return created;
      },
      update: async (args: any) => {
        for (const [k, v] of observations.entries()) {
          if (v.id === args.where.id) {
            const updated = { ...v, ...args.data };
            observations.set(k, updated);
            return updated;
          }
        }
        return null;
      }
    },
    fireIncident: {
      findMany: async () => Array.from(incidents.values()),
      create: async (args: any) => {
        const created = { id: `inc_${seq++}`, ...args.data };
        incidents.set(created.id, created);
        return created;
      },
      update: async (args: any) => {
        const existing = incidents.get(args.where.id);
        if (!existing) return null;
        const updated = { ...existing, ...args.data };
        incidents.set(args.where.id, updated);
        return updated;
      }
    },
    dataIngestionLog: {
      create: async (args: any) => {
        const entry = { id: `log_${seq++}`, ...args.data };
        ingestionLogs.push(entry);
        return entry;
      },
      update: async (args: any) => {
        const idx = ingestionLogs.findIndex((l) => l.id === args.where.id);
        if (idx !== -1) {
          ingestionLogs[idx] = { ...ingestionLogs[idx], ...args.data };
          return ingestionLogs[idx];
        }
        return null;
      }
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
    _state: { observations, incidents, ingestionLogs }
  };

  return dbClient;
}

describe('FirmsIngestionService Unit & Pipeline Tests', () => {
  test('haversineDistanceKm calculates accurate distance between two points', () => {
    const dist = haversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
    assert.ok(dist > 330 && dist < 360, `Expected ~343km, got ${dist}`);
  });

  test('haversineDistanceKm returns 0 for identical coordinates', () => {
    const dist = haversineDistanceKm(39.80, -120.90, 39.80, -120.90);
    assert.strictEqual(Math.round(dist), 0);
  });

  test('classifyLocation accurately resolves continent and country', () => {
    const brazil = classifyLocation(-11.85, -55.50);
    assert.strictEqual(brazil.country, 'Brazil');
    assert.strictEqual(brazil.continent, 'South America');

    const usa = classifyLocation(39.80, -120.90);
    assert.strictEqual(usa.country, 'United States');
    assert.strictEqual(usa.continent, 'North America');

    const india = classifyLocation(23.20, 78.50);
    assert.strictEqual(india.country, 'India');
    assert.strictEqual(india.continent, 'Asia');
  });

  test('1. Valid acquisition date and time parsing produces exact UTC timestamps', () => {
    const full = parseFirmsAcquisitionTimestamp('2026-04-15', '1435');
    assert.ok(full);
    assert.strictEqual(full.observationTime.toISOString(), '2026-04-15T14:35:00.000Z');
    assert.strictEqual(full.acquisitionDate.toISOString(), '2026-04-15T00:00:00.000Z');

    // Unpadded HHMM values from CSV (e.g. '45' -> 00:45 UTC, '0' -> 00:00 UTC, '805' -> 08:05 UTC)
    const unpadded = parseFirmsAcquisitionTimestamp('2026-04-15', '45');
    assert.ok(unpadded);
    assert.strictEqual(unpadded.observationTime.toISOString(), '2026-04-15T00:45:00.000Z');

    const midnight = parseFirmsAcquisitionTimestamp('2026-04-15', '0');
    assert.ok(midnight);
    assert.strictEqual(midnight.observationTime.toISOString(), '2026-04-15T00:00:00.000Z');
  });

  test('2. Invalid acquisition timestamps return null and never fall back to current time', () => {
    assert.strictEqual(parseFirmsAcquisitionTimestamp('', '1200'), null);
    assert.strictEqual(parseFirmsAcquisitionTimestamp('2026-04-15', ''), null);
    assert.strictEqual(parseFirmsAcquisitionTimestamp('2026-02-30', '1200'), null); // calendar rollover
    assert.strictEqual(parseFirmsAcquisitionTimestamp('2026-13-01', '1200'), null);
    assert.strictEqual(parseFirmsAcquisitionTimestamp('2026-04-15', '2400'), null);
    assert.strictEqual(parseFirmsAcquisitionTimestamp('2026-04-15', '1260'), null);
    assert.strictEqual(parseFirmsAcquisitionTimestamp('2026-04-15', 'abcd'), null);
  });

  test('3. VIIRS categorical confidence preserves raw value and sets normalized category without fake numbers', () => {
    const low = parseFirmsConfidence('VIIRS', 'l');
    assert.strictEqual(low.confidenceNumeric, null);
    assert.strictEqual(low.confidenceRaw, 'l');
    assert.strictEqual(low.confidenceCategory, 'LOW');

    const nominal = parseFirmsConfidence('VIIRS', 'n');
    assert.strictEqual(nominal.confidenceNumeric, null);
    assert.strictEqual(nominal.confidenceRaw, 'n');
    assert.strictEqual(nominal.confidenceCategory, 'NOMINAL');

    const high = parseFirmsConfidence('VIIRS', 'h');
    assert.strictEqual(high.confidenceNumeric, null);
    assert.strictEqual(high.confidenceRaw, 'h');
    assert.strictEqual(high.confidenceCategory, 'HIGH');
  });

  test('4. MODIS numeric confidence preserves valid 0-100 scores and rejects invalid strings without arbitrary 85 fallback', () => {
    const low = parseFirmsConfidence('MODIS', '20');
    assert.strictEqual(low.confidenceNumeric, 20);
    assert.strictEqual(low.confidenceCategory, 'LOW');

    const nominal = parseFirmsConfidence('MODIS', '65');
    assert.strictEqual(nominal.confidenceNumeric, 65);
    assert.strictEqual(nominal.confidenceCategory, 'NOMINAL');

    const high = parseFirmsConfidence('MODIS', '92');
    assert.strictEqual(high.confidenceNumeric, 92);
    assert.strictEqual(high.confidenceCategory, 'HIGH');

    const malformed = parseFirmsConfidence('MODIS', '85abc');
    assert.strictEqual(malformed.confidenceNumeric, null);
    assert.strictEqual(malformed.confidenceCategory, null);

    const outOfRange = parseFirmsConfidence('MODIS', '125');
    assert.strictEqual(outOfRange.confidenceNumeric, null);
  });

  test('5. Satellite and platform identification maps MODIS and VIIRS codes accurately', () => {
    const terra = identifyFirmsSensorAndPlatform('MODIS_NRT', 'T', 'MODIS');
    assert.strictEqual(terra.sensor, 'MODIS');
    assert.strictEqual(terra.satellitePlatform, 'Terra');
    assert.strictEqual(terra.satelliteCode, 'T');

    const aqua = identifyFirmsSensorAndPlatform('MODIS_NRT', 'A', 'MODIS');
    assert.strictEqual(aqua.sensor, 'MODIS');
    assert.strictEqual(aqua.satellitePlatform, 'Aqua');
    assert.strictEqual(aqua.satelliteCode, 'A');

    const snpp = identifyFirmsSensorAndPlatform('VIIRS_SNPP_NRT', 'N', 'VIIRS');
    assert.strictEqual(snpp.sensor, 'VIIRS');
    assert.strictEqual(snpp.satellitePlatform, 'Suomi-NPP');
    assert.strictEqual(snpp.satelliteCode, 'N');

    const n20 = identifyFirmsSensorAndPlatform('VIIRS_NOAA20_NRT', 'N20', 'VIIRS');
    assert.strictEqual(n20.sensor, 'VIIRS');
    assert.strictEqual(n20.satellitePlatform, 'NOAA-20');
    assert.strictEqual(n20.satelliteCode, 'N20');

    const n21 = identifyFirmsSensorAndPlatform('VIIRS_NOAA21_NRT', 'N21', 'VIIRS');
    assert.strictEqual(n21.sensor, 'VIIRS');
    assert.strictEqual(n21.satellitePlatform, 'NOAA-21');
    assert.strictEqual(n21.satelliteCode, 'N21');

    // Missing MODIS satellite column should not guess 'Terra'
    const unknownModis = identifyFirmsSensorAndPlatform('MODIS_NRT', '', 'MODIS');
    assert.strictEqual(unknownModis.satellitePlatform, 'Unknown MODIS');
  });

  test('6. parseFirmsCsv skips malformed rows and preserves valid MODIS and VIIRS records', () => {
    const viirsCsv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '23.14521,78.43122,348.5,0.39,0.36,2026-04-10,0815,N20,VIIRS,h,2.0NRT,295.1,18.4,D',
      '95.00000,78.43122,340.0,0.39,0.36,2026-04-10,0815,N20,VIIRS,n,2.0NRT,290.0,10.0,D', // invalid lat > 90
      '21.10000,79.20000,335.0,0.40,0.38,2026-02-30,0815,N20,VIIRS,l,2.0NRT,289.0,8.2,D', // invalid calendar date
      '22.50000,77.10000' // missing columns
    ].join('\n');

    const parsed = parseFirmsCsv(viirsCsv, 'VIIRS_NOAA20_NRT');
    assert.strictEqual(parsed.totalRows, 4);
    assert.strictEqual(parsed.records.length, 1);
    assert.strictEqual(parsed.skippedCount, 3);

    const rec = parsed.records[0];
    assert.strictEqual(rec.sensor, 'VIIRS');
    assert.strictEqual(rec.satellitePlatform, 'NOAA-20');
    assert.strictEqual(rec.satelliteCode, 'N20');
    assert.strictEqual(rec.confidence, null);
    assert.strictEqual(rec.confidenceRaw, 'h');
    assert.strictEqual(rec.confidenceCategory, 'HIGH');
    assert.strictEqual(rec.observationTime.toISOString(), '2026-04-10T08:15:00.000Z');
    assert.strictEqual(rec.brightnessTemp, 348.5);
    assert.strictEqual(rec.brightnessTemp31, 295.1);
    assert.strictEqual(rec.frp, 18.4);
    assert.strictEqual(rec.dayNight, 'Day');
    assert.strictEqual(rec.version, '2.0NRT');
  });

  test('7. Duplicate observations in payload and across repeated runs are safely deduplicated', async () => {
    const dbClient = createMockDbClient();
    const modisCsv = [
      'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight',
      '21.15001,79.10002,332.4,1.1,1.0,2026-04-11,0530,T,MODIS,88,6.1NRT,298.2,42.5,D',
      '21.15001,79.10002,332.4,1.1,1.0,2026-04-11,0530,T,MODIS,88,6.1NRT,298.2,42.5,D', // duplicate in same CSV
      '22.25001,80.10002,341.0,1.2,1.1,2026-04-11,0820,A,MODIS,94,6.1NRT,300.1,67.0,D'
    ].join('\n');

    const parsed1 = parseFirmsCsv(modisCsv, 'MODIS_NRT');
    const firstRun = await FirmsIngestionService.ingestObservations('MODIS_NRT', parsed1.records, { dbClient });
    assert.strictEqual(firstRun.inserted, 2);
    assert.strictEqual(firstRun.updated, 0);
    assert.strictEqual(dbClient._state.observations.size, 2);

    // Second run with updated FRP on same observation should update, not insert duplicate
    const modisCsvUpdated = modisCsv.replace('42.5', '48.0');
    const parsed2 = parseFirmsCsv(modisCsvUpdated, 'MODIS_NRT');
    const secondRun = await FirmsIngestionService.ingestObservations('MODIS_NRT', parsed2.records, { dbClient });
    assert.strictEqual(secondRun.inserted, 0);
    assert.strictEqual(secondRun.updated, 2);
    assert.strictEqual(dbClient._state.observations.size, 2);
  });

  test('8. Empty FIRMS API responses (header-only or blank) are handled gracefully without errors', async () => {
    const dbClient = createMockDbClient();
    const headerOnly =
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n';

    const summary = await FirmsIngestionService.executeSyncJob({
      mapKey: 'TEST_KEY',
      countryCode: 'IND',
      sources: ['VIIRS_NOAA20_NRT'],
      dbClient,
      httpGet: async () => ({ status: 200, data: headerOnly })
    });

    assert.strictEqual(summary.status, 'COMPLETED');
    assert.strictEqual(summary.sources.length, 1);
    assert.strictEqual(summary.sources[0].status, 'EMPTY');
    assert.strictEqual(dbClient._state.observations.size, 0);
    assert.strictEqual(dbClient._state.ingestionLogs.length, 1);
    assert.strictEqual(dbClient._state.ingestionLogs[0].status, 'SUCCESS');
  });

  test('9. API failures (HTTP 429, plain-text key error, missing key) log failures and never inject mock observations', async () => {
    const dbClient = createMockDbClient();

    // Missing API key skips cleanly without fake hotspots
    const skippedSummary = await FirmsIngestionService.executeSyncJob({
      mapKey: '',
      dbClient
    });
    assert.strictEqual(skippedSummary.status, 'SKIPPED');
    assert.strictEqual(dbClient._state.observations.size, 0);

    // Rate limit (429) and Invalid MAP_KEY payload handling
    let callCount = 0;
    const failedSummary = await FirmsIngestionService.executeSyncJob({
      mapKey: 'BAD_KEY',
      countryCode: 'IND',
      sources: ['MODIS_NRT', 'VIIRS_SNPP_NRT'],
      dbClient,
      httpGet: async () => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Too Many Requests');
          err.response = { status: 429 };
          throw err;
        }
        return { status: 200, data: 'Invalid MAP_KEY.' };
      }
    });

    assert.strictEqual(failedSummary.status, 'FAILED');
    assert.strictEqual(failedSummary.sources[0].status, 'FAILED');
    assert.match(failedSummary.sources[0].error || '', /rate limit/i);
    assert.strictEqual(failedSummary.sources[1].status, 'FAILED');
    assert.match(failedSummary.sources[1].error || '', /Invalid MAP_KEY/i);
    assert.strictEqual(dbClient._state.observations.size, 0);
    assert.strictEqual(dbClient._state.ingestionLogs.length, 2);
    assert.strictEqual(dbClient._state.ingestionLogs[0].status, 'FAILED');
    assert.strictEqual(dbClient._state.ingestionLogs[1].status, 'FAILED');
  });

  test('10. FRP null vs zero vs positive preserves exact value without fabricating 180 or coercing null to zero', () => {
    // 1. parseFirmsCsv with positive, measured zero, and missing FRP
    const csvWithMixedFrp = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '23.1,78.4,348.5,0.39,0.36,2026-04-10,0815,N20,VIIRS,h,2.0NRT,295.1,18.4,D', // Positive FRP
      '23.2,78.5,310.0,0.39,0.36,2026-04-10,0815,N20,VIIRS,n,2.0NRT,290.1,0.0,D',  // Genuine measured 0.0 FRP
      '23.3,78.6,320.0,0.39,0.36,2026-04-10,0815,N20,VIIRS,l,2.0NRT,291.1,,D'       // Missing FRP
    ].join('\n');

    const parsed = parseFirmsCsv(csvWithMixedFrp, 'VIIRS_NOAA20_NRT');
    assert.strictEqual(parsed.records.length, 3);
    assert.strictEqual(parsed.records[0].frp, 18.4);
    assert.strictEqual(parsed.records[1].frp, 0);
    assert.strictEqual(parsed.records[2].frp, undefined);

    // 2. FireService.enrichObservation preserves null, zero and positive FRP
    const enrichedPositive = (classifyLocation as any).FireService
      ? (classifyLocation as any).FireService.enrichObservation({
          latitude: 23.1,
          longitude: 78.4,
          frp: 18.4,
          confidence: 90,
          satellitePlatform: 'Terra',
          sensor: 'MODIS',
          observationTime: new Date('2026-04-10T08:15:00Z'),
          acquisitionDate: new Date('2026-04-10T00:00:00Z'),
          brightnessTemp: 340
        })
      : null;

    // Directly test FireService from fireService module
    const { FireService } = require('./fireService');
    const posObs = FireService.enrichObservation({
      id: 'obs_pos',
      latitude: 23.1,
      longitude: 78.4,
      frp: 18.4,
      confidence: 90,
      satellitePlatform: 'Terra',
      sensor: 'MODIS',
      observationTime: new Date('2026-04-10T08:15:00Z'),
      acquisitionDate: new Date('2026-04-10T00:00:00Z'),
      brightnessTemp: 340
    });
    assert.strictEqual(posObs.frp, 18.4);
    assert.strictEqual(posObs.brightnessTempK, 340);
    assert.strictEqual(posObs.biomassCombustionRateKgS, 1.5);

    const zeroObs = FireService.enrichObservation({
      id: 'obs_zero',
      latitude: 23.2,
      longitude: 78.5,
      frp: 0,
      confidence: null,
      confidenceCategory: 'NOMINAL',
      satellitePlatform: 'NOAA-20',
      sensor: 'VIIRS',
      observationTime: new Date('2026-04-10T08:15:00Z'),
      acquisitionDate: new Date('2026-04-10T00:00:00Z'),
      brightnessTemp: 300
    });
    assert.strictEqual(zeroObs.frp, 0);
    assert.strictEqual(zeroObs.biomassCombustionRateKgS, 0);

    const nullObs = FireService.enrichObservation({
      id: 'obs_null',
      latitude: 23.3,
      longitude: 78.6,
      frp: null,
      confidence: null,
      confidenceCategory: 'LOW',
      satellitePlatform: 'NOAA-20',
      sensor: 'VIIRS',
      observationTime: new Date('2026-04-10T08:15:00Z'),
      acquisitionDate: new Date('2026-04-10T00:00:00Z'),
      brightnessTemp: null
    });
    assert.strictEqual(nullObs.frp, null);
    assert.strictEqual(nullObs.brightnessTempK, null);
    assert.strictEqual(nullObs.brightnessTempC, null);
    assert.strictEqual(nullObs.biomassCombustionRateKgS, null);
  });

  test('buildFirmsRequestUrl constructs configurable India Country and Area endpoints', () => {
    const countryUrl = buildFirmsRequestUrl({
      mapKey: 'MY_KEY',
      source: 'VIIRS_SNPP_NRT',
      queryMode: 'country',
      countryCode: 'IND',
      dayRange: 2
    });
    assert.strictEqual(
      countryUrl,
      'https://firms.modaps.eosdis.nasa.gov/api/country/csv/MY_KEY/VIIRS_SNPP_NRT/IND/2'
    );

    const areaUrl = buildFirmsRequestUrl({
      mapKey: 'MY_KEY',
      source: 'MODIS_NRT',
      queryMode: 'area',
      areaBbox: '68.0,6.5,97.5,37.5',
      dayRange: 1,
      date: '2026-04-10'
    });
    assert.strictEqual(
      areaUrl,
      'https://firms.modaps.eosdis.nasa.gov/api/area/csv/MY_KEY/MODIS_NRT/68.0,6.5,97.5,37.5/1/2026-04-10'
    );
  });
});
