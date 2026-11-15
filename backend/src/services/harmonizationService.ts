import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { haversineDistanceKm } from './firmsIngestionService';
import { HarmonizationMatchClass, HarmonizationRunStatus } from '@prisma/client';

export const EQUAL_EARTH_CRS = 'EPSG:8857';
const EARTH_AUTHALIC_RADIUS_M = 6371007.181;
const EE_A1 = 1.340264;
const EE_A2 = -0.081106;
const EE_A3 = 0.000893;
const EE_A4 = 0.003796;

export interface HarmonizationConfig {
  regionName: string;
  minLat?: number;
  maxLat?: number;
  minLon?: number;
  maxLon?: number;
  startDate?: Date;
  endDate?: Date;
  spatialDistanceM: number;
  timeWindowMinutes: number;
  gridResolutionM: number;
}

export interface PreparedObservation {
  id: string;
  sourceId: string | null;
  sourceDataset: string;
  sensor: 'MODIS' | 'VIIRS';
  satellitePlatform: string;
  satelliteCode: string | null;
  latitude: number;
  longitude: number;
  observationTime: Date;
  acqDateStr: string;
  acqDateUtc: Date;
  frp: number | null;
  brightnessTemp: number | null;
  confidence: number | null;
  confidenceRaw: string | null;
  confidenceCategory: string | null;
  dayNight: string | null;
  scan: number | null;
  track: number | null;
  projX: number;
  projY: number;
  gridColI: number;
  gridRowJ: number;
  gridCellId: string;
}

export interface HarmonizedMatchRecord {
  matchKey: string;
  matchClass: HarmonizationMatchClass;
  modisObservationId: string | null;
  viirsObservationId: string | null;
  gridCellId: string;
  spatialCrs: string;
  gridResolutionM: number;
  distanceM: number | null;
  timeDiffMinutes: number | null;
  matchScore: number | null;
  matchingCriteria: Record<string, unknown>;
  acqDate: Date;
  modisObservation?: PreparedObservation | null;
  viirsObservation?: PreparedObservation | null;
}

export interface DailyHarmonizedSummaryRecord {
  date: Date;
  dateStr: string;
  regionName: string;
  modisCount: number;
  viirsCount: number;
  candidateMatchCount: number;
  modisOnlyCount: number;
  viirsOnlyCount: number;
  uniqueGridCells: number;
  modisValidFrpCount: number;
  modisFrpSumMw: number | null;
  modisFrpMeanMw: number | null;
  modisFrpMaxMw: number | null;
  viirsValidFrpCount: number;
  viirsFrpSumMw: number | null;
  viirsFrpMeanMw: number | null;
  viirsFrpMaxMw: number | null;
  estimatedBurnedAreaHa: null;
  provenanceAndNotes: Record<string, unknown>;
}

export interface HarmonizationAlgorithmResult {
  totalInputObservations: number;
  validModisCount: number;
  validViirsCount: number;
  rejectedCount: number;
  candidateMatchCount: number;
  modisOnlyCount: number;
  viirsOnlyCount: number;
  uniqueGridCells: number;
  matches: HarmonizedMatchRecord[];
  dailySummaries: DailyHarmonizedSummaryRecord[];
  scientificNotes: Record<string, unknown>;
}

/**
 * Closed-form Equal Earth projection (EPSG:8857) in meters.
 * Preserves equal surface area globally so grid cells represent equal ground area.
 */
export function projectEqualEarth(latitude: number, longitude: number): { x: number; y: number } {
  const phi = (latitude * Math.PI) / 180;
  const lambda = (longitude * Math.PI) / 180;
  const sinTheta = Math.max(-1, Math.min(1, (Math.sqrt(3) / 2) * Math.sin(phi)));
  const theta = Math.asin(sinTheta);
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;

  const xDenom = 3 * (EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2));
  const x = EARTH_AUTHALIC_RADIUS_M * ((2 * Math.sqrt(3) * lambda * Math.cos(theta)) / xDenom);
  const y = EARTH_AUTHALIC_RADIUS_M * theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2));

  return { x, y };
}

/**
 * Deterministically assigns planar Equal Earth coordinates to a discrete grid cell.
 * Cell ID encodes exact resolution in meters so sub-kilometer grids remain unambiguous.
 */
export function assignSpatialGridCell(
  latitude: number,
  longitude: number,
  gridResolutionM = 1000
): { projX: number; projY: number; colI: number; rowJ: number; cellId: string } {
  const res = Math.max(10, gridResolutionM);
  const { x, y } = projectEqualEarth(latitude, longitude);
  const colI = Math.floor(x / res);
  const rowJ = Math.floor(y / res);

  const resLabel = Number.isInteger(res) ? `${res}M` : `${res.toFixed(1)}M`;
  const colSign = colI >= 0 ? '+' : '-';
  const rowSign = rowJ >= 0 ? '+' : '-';
  const cellId = `EE_${resLabel}_X${colSign}${Math.abs(colI).toString().padStart(7, '0')}_Y${rowSign}${Math.abs(rowJ).toString().padStart(7, '0')}`;

  return {
    projX: Number(x.toFixed(2)),
    projY: Number(y.toFixed(2)),
    colI,
    rowJ,
    cellId
  };
}

function normalizeSensor(sensorRaw: string | null | undefined): 'MODIS' | 'VIIRS' | null {
  const s = (sensorRaw || '').trim().toUpperCase();
  if (s === 'MODIS' || s.includes('MODIS')) return 'MODIS';
  if (s === 'VIIRS' || s.includes('VIIRS')) return 'VIIRS';
  return null;
}

function computeFrpStats(frps: Array<number | null>): {
  validCount: number;
  sumMw: number | null;
  meanMw: number | null;
  maxMw: number | null;
} {
  const valid = frps.filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0);
  if (valid.length === 0) {
    return { validCount: 0, sumMw: null, meanMw: null, maxMw: null };
  }
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return {
    validCount: valid.length,
    sumMw: Number(sum.toFixed(2)),
    meanMw: Number((sum / valid.length).toFixed(2)),
    maxMw: Number(Math.max(...valid).toFixed(2))
  };
}

/**
 * Validates and prepares raw FireObservation records without inventing missing measurements.
 */
export function prepareHarmonizationInputs(
  rawObservations: Array<any>,
  gridResolutionM = 1000
): { prepared: PreparedObservation[]; rejectedCount: number } {
  const prepared: PreparedObservation[] = [];
  const seenIds = new Set<string>();
  const seenSourceIds = new Set<string>();
  let rejectedCount = 0;

  for (const raw of rawObservations) {
    if (!raw || !raw.id) {
      rejectedCount++;
      continue;
    }
    const id = String(raw.id);
    if (seenIds.has(id)) {
      rejectedCount++;
      continue;
    }

    const sourceId = raw.sourceId ? String(raw.sourceId) : null;
    if (sourceId && seenSourceIds.has(sourceId)) {
      rejectedCount++;
      continue;
    }

    const sensor = normalizeSensor(raw.sensor);
    const lat = Number(raw.latitude);
    const lon = Number(raw.longitude);
    const obsTime = raw.observationTime instanceof Date ? raw.observationTime : new Date(raw.observationTime);

    if (
      !sensor ||
      raw.latitude === null ||
      raw.latitude === undefined ||
      raw.longitude === null ||
      raw.longitude === undefined ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180 ||
      !(obsTime instanceof Date) ||
      Number.isNaN(obsTime.getTime())
    ) {
      rejectedCount++;
      continue;
    }

    seenIds.add(id);
    if (sourceId) seenSourceIds.add(sourceId);

    const grid = assignSpatialGridCell(lat, lon, gridResolutionM);
    const acqDateStr = obsTime.toISOString().slice(0, 10);
    const acqDateUtc = new Date(`${acqDateStr}T00:00:00.000Z`);

    // Strictly preserve null when missing; never interpret VIIRS categorical confidence as numeric
    const numericConf =
      sensor === 'MODIS' &&
      raw.confidence !== null &&
      raw.confidence !== undefined &&
      Number.isFinite(Number(raw.confidence))
        ? Number(raw.confidence)
        : null;

    const frpVal =
      raw.frp !== null && raw.frp !== undefined && Number.isFinite(Number(raw.frp)) && Number(raw.frp) >= 0
        ? Number(raw.frp)
        : null;

    const brightVal =
      raw.brightnessTemp !== null &&
      raw.brightnessTemp !== undefined &&
      Number.isFinite(Number(raw.brightnessTemp)) &&
      Number(raw.brightnessTemp) > 0
        ? Number(raw.brightnessTemp)
        : null;

    prepared.push({
      id,
      sourceId,
      sourceDataset: String(raw.sourceDataset || 'UNKNOWN'),
      sensor,
      satellitePlatform: String(raw.satellitePlatform || 'Unknown'),
      satelliteCode: raw.satelliteCode ? String(raw.satelliteCode) : null,
      latitude: lat,
      longitude: lon,
      observationTime: obsTime,
      acqDateStr,
      acqDateUtc,
      frp: frpVal,
      brightnessTemp: brightVal,
      confidence: numericConf,
      confidenceRaw: raw.confidenceRaw ? String(raw.confidenceRaw) : numericConf !== null ? String(numericConf) : null,
      confidenceCategory: raw.confidenceCategory ? String(raw.confidenceCategory) : null,
      dayNight: raw.dayNight ? String(raw.dayNight) : null,
      scan: raw.scan !== null && raw.scan !== undefined && Number.isFinite(Number(raw.scan)) ? Number(raw.scan) : null,
      track: raw.track !== null && raw.track !== undefined && Number.isFinite(Number(raw.track)) ? Number(raw.track) : null,
      projX: grid.projX,
      projY: grid.projY,
      gridColI: grid.colI,
      gridRowJ: grid.rowJ,
      gridCellId: grid.cellId
    });
  }

  return { prepared, rejectedCount };
}

/**
 * Pure MODIS-VIIRS Spatiotemporal Candidate Matching & Daily Aggregation Engine.
 * Enforces 1:1 bipartite matching, preserves all unmatched detections, and avoids arbitrary corrections.
 */
export function runHarmonizationAlgorithm(
  rawObservations: Array<any>,
  config: Partial<HarmonizationConfig> = {}
): HarmonizationAlgorithmResult {
  const spatialDistanceM = Math.max(1, config.spatialDistanceM ?? 1500);
  const timeWindowMinutes = Math.max(1, config.timeWindowMinutes ?? 60);
  const gridResolutionM = Math.max(10, config.gridResolutionM ?? 1000);
  const regionName = config.regionName || 'India Regional Corridor';

  const { prepared, rejectedCount } = prepareHarmonizationInputs(rawObservations, gridResolutionM);

  const modisObs = prepared.filter((o) => o.sensor === 'MODIS');
  const viirsObs = prepared.filter((o) => o.sensor === 'VIIRS');

  // Index VIIRS sorted by timestamp for O(N log N) temporal window lookup
  const viirsSorted = [...viirsObs].sort((a, b) => a.observationTime.getTime() - b.observationTime.getTime());
  const viirsTimesMs = viirsSorted.map((v) => v.observationTime.getTime());
  const maxTimeMs = timeWindowMinutes * 60 * 1000;

  interface CandidateEdge {
    modisIdx: number;
    viirsIdx: number;
    distanceM: number;
    timeDiffMinutes: number;
    cost: number;
    matchScore: number;
  }

  const candidateEdges: CandidateEdge[] = [];

  for (let mIdx = 0; mIdx < modisObs.length; mIdx++) {
    const m = modisObs[mIdx];
    const mTimeMs = m.observationTime.getTime();
    const minT = mTimeMs - maxTimeMs;
    const maxT = mTimeMs + maxTimeMs;

    // Binary search lower bound
    let lo = 0;
    let hi = viirsTimesMs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (viirsTimesMs[mid] < minT) lo = mid + 1;
      else hi = mid;
    }

    for (let vIdx = lo; vIdx < viirsSorted.length && viirsTimesMs[vIdx] <= maxT; vIdx++) {
      const v = viirsSorted[vIdx];
      const timeDiffMinutes = Math.abs(mTimeMs - v.observationTime.getTime()) / 60000;
      if (timeDiffMinutes > timeWindowMinutes) continue;

      const distanceM = haversineDistanceKm(m.latitude, m.longitude, v.latitude, v.longitude) * 1000;
      if (distanceM > spatialDistanceM) continue;

      const normSpatial = distanceM / spatialDistanceM;
      const normTemporal = timeDiffMinutes / timeWindowMinutes;
      const cost = 0.5 * normSpatial + 0.5 * normTemporal;
      const matchScore = Number(Math.max(0, Math.min(1, 1 - cost)).toFixed(4));

      candidateEdges.push({
        modisIdx: mIdx,
        viirsIdx: vIdx,
        distanceM: Number(distanceM.toFixed(2)),
        timeDiffMinutes: Number(timeDiffMinutes.toFixed(2)),
        cost,
        matchScore
      });
    }
  }

  // Greedy 1:1 bipartite assignment by lowest spatiotemporal cost
  candidateEdges.sort((a, b) => a.cost - b.cost);

  const matchedModisIndices = new Set<number>();
  const matchedViirsIndices = new Set<number>();
  const matches: HarmonizedMatchRecord[] = [];
  const criteria = {
    spatialDistanceM,
    timeWindowMinutes,
    gridResolutionM,
    spatialCrs: EQUAL_EARTH_CRS,
    matchingMode: 'ONE_TO_ONE_MINIMUM_COST'
  };

  for (const edge of candidateEdges) {
    if (matchedModisIndices.has(edge.modisIdx) || matchedViirsIndices.has(edge.viirsIdx)) {
      continue;
    }
    matchedModisIndices.add(edge.modisIdx);
    matchedViirsIndices.add(edge.viirsIdx);

    const m = modisObs[edge.modisIdx];
    const v = viirsSorted[edge.viirsIdx];

    matches.push({
      matchKey: `CANDIDATE_MATCH:${m.id}:${v.id}`,
      matchClass: HarmonizationMatchClass.CANDIDATE_MATCH,
      modisObservationId: m.id,
      viirsObservationId: v.id,
      gridCellId: m.gridCellId,
      spatialCrs: EQUAL_EARTH_CRS,
      gridResolutionM,
      distanceM: edge.distanceM,
      timeDiffMinutes: edge.timeDiffMinutes,
      matchScore: edge.matchScore,
      matchingCriteria: criteria,
      acqDate: m.acqDateUtc,
      modisObservation: m,
      viirsObservation: v
    });
  }

  let modisOnlyCount = 0;
  for (let mIdx = 0; mIdx < modisObs.length; mIdx++) {
    if (matchedModisIndices.has(mIdx)) continue;
    modisOnlyCount++;
    const m = modisObs[mIdx];
    matches.push({
      matchKey: `MODIS_ONLY:${m.id}`,
      matchClass: HarmonizationMatchClass.MODIS_ONLY,
      modisObservationId: m.id,
      viirsObservationId: null,
      gridCellId: m.gridCellId,
      spatialCrs: EQUAL_EARTH_CRS,
      gridResolutionM,
      distanceM: null,
      timeDiffMinutes: null,
      matchScore: null,
      matchingCriteria: criteria,
      acqDate: m.acqDateUtc,
      modisObservation: m,
      viirsObservation: null
    });
  }

  let viirsOnlyCount = 0;
  for (let vIdx = 0; vIdx < viirsSorted.length; vIdx++) {
    if (matchedViirsIndices.has(vIdx)) continue;
    viirsOnlyCount++;
    const v = viirsSorted[vIdx];
    matches.push({
      matchKey: `VIIRS_ONLY:${v.id}`,
      matchClass: HarmonizationMatchClass.VIIRS_ONLY,
      modisObservationId: null,
      viirsObservationId: v.id,
      gridCellId: v.gridCellId,
      spatialCrs: EQUAL_EARTH_CRS,
      gridResolutionM,
      distanceM: null,
      timeDiffMinutes: null,
      matchScore: null,
      matchingCriteria: criteria,
      acqDate: v.acqDateUtc,
      modisObservation: null,
      viirsObservation: v
    });
  }

  // Daily Harmonized Aggregation
  const datesSet = new Set<string>(prepared.map((p) => p.acqDateStr));
  const sortedDates = Array.from(datesSet).sort();
  const allGridCells = new Set<string>(prepared.map((p) => p.gridCellId));

  const dailySummaries: DailyHarmonizedSummaryRecord[] = sortedDates.map((dateStr) => {
    const dayObs = prepared.filter((p) => p.acqDateStr === dateStr);
    const dayModis = dayObs.filter((p) => p.sensor === 'MODIS');
    const dayViirs = dayObs.filter((p) => p.sensor === 'VIIRS');
    const dayMatches = matches.filter((m) => m.acqDate.toISOString().slice(0, 10) === dateStr);

    const dayCandidateCount = dayMatches.filter((m) => m.matchClass === HarmonizationMatchClass.CANDIDATE_MATCH).length;
    const dayModisOnlyCount = dayMatches.filter((m) => m.matchClass === HarmonizationMatchClass.MODIS_ONLY).length;
    const dayViirsOnlyCount = dayMatches.filter((m) => m.matchClass === HarmonizationMatchClass.VIIRS_ONLY).length;
    const dayCells = new Set(dayObs.map((p) => p.gridCellId));

    const modisFrpStats = computeFrpStats(dayModis.map((o) => o.frp));
    const viirsFrpStats = computeFrpStats(dayViirs.map((o) => o.frp));

    return {
      date: new Date(`${dateStr}T00:00:00.000Z`),
      dateStr,
      regionName,
      modisCount: dayModis.length,
      viirsCount: dayViirs.length,
      candidateMatchCount: dayCandidateCount,
      modisOnlyCount: dayModisOnlyCount,
      viirsOnlyCount: dayViirsOnlyCount,
      uniqueGridCells: dayCells.size,
      modisValidFrpCount: modisFrpStats.validCount,
      modisFrpSumMw: modisFrpStats.sumMw,
      modisFrpMeanMw: modisFrpStats.meanMw,
      modisFrpMaxMw: modisFrpStats.maxMw,
      viirsValidFrpCount: viirsFrpStats.validCount,
      viirsFrpSumMw: viirsFrpStats.sumMw,
      viirsFrpMeanMw: viirsFrpStats.meanMw,
      viirsFrpMaxMw: viirsFrpStats.maxMw,
      estimatedBurnedAreaHa: null,
      provenanceAndNotes: {
        sourceDatasets: Array.from(new Set(dayObs.map((o) => o.sourceDataset))),
        satellitePlatforms: Array.from(new Set(dayObs.map((o) => o.satellitePlatform))),
        spatialGrid: `${EQUAL_EARTH_CRS} (${gridResolutionM}m cell aggregation, not exact pixel-footprint overlap)`,
        matchingThresholds: { spatialDistanceM, timeWindowMinutes },
        burnedAreaNote: 'Null: Instantaneous FRP is not converted to burned area without independent fire-duration validation.',
        detectionDisclaimer: 'Counts represent satellite thermal anomaly detections, not confirmed unique physical wildfires.'
      }
    };
  });

  const scientificNotes = {
    gridMethod: `Equal Earth (${EQUAL_EARTH_CRS}) ${gridResolutionM}m deterministic grid-cell aggregation (not exact satellite pixel-footprint overlap).`,
    matchingMethod: `One-to-one minimum-cost bipartite matching within ${spatialDistanceM}m and ${timeWindowMinutes} minutes.`,
    coDetectionCaveat: 'CANDIDATE_MATCH indicates spatiotemporal proximity only, not proof that MODIS and VIIRS observed the identical physical fire.',
    unmatchedPreservation: 'MODIS_ONLY and VIIRS_ONLY detections are preserved in full; raw sensor counts are never summed into a combined count.',
    confidenceIntegrity: 'VIIRS categorical confidence is never coerced into numeric percentages; missing FRP/brightness remain null.',
    burnedAreaPolicy: 'estimatedBurnedAreaHa is null because instantaneous FRP cannot be reliably converted to burned area using an arbitrary fixed duration.'
  };

  return {
    totalInputObservations: rawObservations.length,
    validModisCount: modisObs.length,
    validViirsCount: viirsObs.length,
    rejectedCount,
    candidateMatchCount: matchedModisIndices.size,
    modisOnlyCount,
    viirsOnlyCount,
    uniqueGridCells: allGridCells.size,
    matches,
    dailySummaries,
    scientificNotes
  };
}

export class HarmonizationService {
  /**
   * Executes harmonization against FireObservation records in PostgreSQL and persists run,
   * candidate/unmatched classifications, and daily summaries inside safe transactions.
   */
  public static async executeHarmonizationRun(
    config: Partial<HarmonizationConfig> = {},
    dbClient: typeof prisma = prisma
  ) {
    const regionName = config.regionName?.trim() || 'India Regional Corridor';
    const spatialDistanceM = config.spatialDistanceM ?? 1500;
    const timeWindowMinutes = config.timeWindowMinutes ?? 60;
    const gridResolutionM = config.gridResolutionM ?? 1000;

    const where: any = {};
    if (config.minLat !== undefined && config.maxLat !== undefined) {
      where.latitude = { gte: config.minLat, lte: config.maxLat };
    }
    if (config.minLon !== undefined && config.maxLon !== undefined) {
      where.longitude = { gte: config.minLon, lte: config.maxLon };
    }
    if (config.startDate || config.endDate) {
      where.observationTime = {};
      if (config.startDate) where.observationTime.gte = config.startDate;
      if (config.endDate) where.observationTime.lte = config.endDate;
    }

    const run = await dbClient.harmonizationRun.create({
      data: {
        regionName,
        minLat: config.minLat ?? null,
        maxLat: config.maxLat ?? null,
        minLon: config.minLon ?? null,
        maxLon: config.maxLon ?? null,
        startDate: config.startDate ?? null,
        endDate: config.endDate ?? null,
        gridResolutionM,
        spatialCrs: EQUAL_EARTH_CRS,
        spatialDistanceM,
        timeWindowMinutes,
        status: HarmonizationRunStatus.RUNNING
      }
    });

    try {
      const observations = await dbClient.fireObservation.findMany({
        where,
        orderBy: { observationTime: 'asc' }
      });

      const result = runHarmonizationAlgorithm(observations, {
        regionName,
        spatialDistanceM,
        timeWindowMinutes,
        gridResolutionM
      });

      // Persist matches in 100-row transactional batches with upsert deduplication
      const CHUNK_SIZE = 100;
      for (let i = 0; i < result.matches.length; i += CHUNK_SIZE) {
        const chunk = result.matches.slice(i, i + CHUNK_SIZE);
        await dbClient.$transaction(
          chunk.map((m) =>
            dbClient.harmonizedObservationMatch.upsert({
              where: {
                runId_matchKey: {
                  runId: run.id,
                  matchKey: m.matchKey
                }
              },
              update: {},
              create: {
                runId: run.id,
                matchKey: m.matchKey,
                matchClass: m.matchClass,
                modisObservationId: m.modisObservationId,
                viirsObservationId: m.viirsObservationId,
                gridCellId: m.gridCellId,
                spatialCrs: m.spatialCrs,
                gridResolutionM: m.gridResolutionM,
                distanceM: m.distanceM,
                timeDiffMinutes: m.timeDiffMinutes,
                matchScore: m.matchScore,
                matchingCriteria: m.matchingCriteria as any,
                acqDate: m.acqDate
              }
            })
          )
        );
      }

      // Persist daily summaries
      if (result.dailySummaries.length > 0) {
        await dbClient.$transaction(
          result.dailySummaries.map((d) =>
            dbClient.harmonizedDailySummary.upsert({
              where: {
                runId_date: {
                  runId: run.id,
                  date: d.date
                }
              },
              update: {},
              create: {
                runId: run.id,
                date: d.date,
                regionName: d.regionName,
                modisCount: d.modisCount,
                viirsCount: d.viirsCount,
                candidateMatchCount: d.candidateMatchCount,
                modisOnlyCount: d.modisOnlyCount,
                viirsOnlyCount: d.viirsOnlyCount,
                uniqueGridCells: d.uniqueGridCells,
                modisValidFrpCount: d.modisValidFrpCount,
                modisFrpSumMw: d.modisFrpSumMw,
                modisFrpMeanMw: d.modisFrpMeanMw,
                modisFrpMaxMw: d.modisFrpMaxMw,
                viirsValidFrpCount: d.viirsValidFrpCount,
                viirsFrpSumMw: d.viirsFrpSumMw,
                viirsFrpMeanMw: d.viirsFrpMeanMw,
                viirsFrpMaxMw: d.viirsFrpMaxMw,
                estimatedBurnedAreaHa: null,
                provenanceAndNotes: d.provenanceAndNotes as any
              }
            })
          )
        );
      }

      const completedRun = await dbClient.harmonizationRun.update({
        where: { id: run.id },
        data: {
          status: HarmonizationRunStatus.COMPLETED,
          totalInputObservations: result.totalInputObservations,
          validModisCount: result.validModisCount,
          validViirsCount: result.validViirsCount,
          rejectedCount: result.rejectedCount,
          candidateMatchCount: result.candidateMatchCount,
          modisOnlyCount: result.modisOnlyCount,
          viirsOnlyCount: result.viirsOnlyCount,
          uniqueGridCells: result.uniqueGridCells,
          scientificNotes: result.scientificNotes as any,
          completedAt: new Date()
        }
      });

      logger.info(
        `Harmonization run ${run.id} completed: ${result.candidateMatchCount} candidate matches, ${result.modisOnlyCount} MODIS-only, ${result.viirsOnlyCount} VIIRS-only.`
      );

      return {
        run: completedRun,
        summary: {
          totalInputObservations: result.totalInputObservations,
          validModisCount: result.validModisCount,
          validViirsCount: result.validViirsCount,
          rejectedCount: result.rejectedCount,
          candidateMatchCount: result.candidateMatchCount,
          modisOnlyCount: result.modisOnlyCount,
          viirsOnlyCount: result.viirsOnlyCount,
          uniqueGridCells: result.uniqueGridCells
        },
        dailySummaries: result.dailySummaries,
        scientificNotes: result.scientificNotes
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Harmonization execution failed';
      logger.error(`Harmonization run ${run.id} failed: ${msg}`);
      await dbClient.harmonizationRun.update({
        where: { id: run.id },
        data: {
          status: HarmonizationRunStatus.FAILED,
          errorMessage: msg,
          completedAt: new Date()
        }
      });
      throw err;
    }
  }

  public static async getLatestStatus(dbClient: typeof prisma = prisma) {
    const [latestRun, recentRuns] = await Promise.all([
      dbClient.harmonizationRun.findFirst({ orderBy: { createdAt: 'desc' } }),
      dbClient.harmonizationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
    ]);
    return { latestRun, recentRuns };
  }

  public static async getResults(
    params: { runId?: string; matchClass?: HarmonizationMatchClass; limit?: number; offset?: number },
    dbClient: typeof prisma = prisma
  ) {
    let targetRun = params.runId
      ? await dbClient.harmonizationRun.findUnique({ where: { id: params.runId } })
      : await dbClient.harmonizationRun.findFirst({
          where: { status: HarmonizationRunStatus.COMPLETED },
          orderBy: { createdAt: 'desc' }
        });

    if (!targetRun) {
      return { run: null, items: [], total: 0 };
    }

    const where: any = { runId: targetRun.id };
    if (params.matchClass) {
      where.matchClass = params.matchClass;
    }

    const limit = Math.min(params.limit || 200, 1000);
    const offset = params.offset || 0;

    const [items, total] = await Promise.all([
      dbClient.harmonizedObservationMatch.findMany({
        where,
        include: {
          modisObservation: true,
          viirsObservation: true
        },
        orderBy: [{ acqDate: 'desc' }, { matchScore: 'desc' }],
        skip: offset,
        take: limit
      }),
      dbClient.harmonizedObservationMatch.count({ where })
    ]);

    return { run: targetRun, items, total };
  }

  public static async getDailySummaries(
    params: { runId?: string; startDate?: Date; endDate?: Date },
    dbClient: typeof prisma = prisma
  ) {
    const targetRun = params.runId
      ? await dbClient.harmonizationRun.findUnique({ where: { id: params.runId } })
      : await dbClient.harmonizationRun.findFirst({
          where: { status: HarmonizationRunStatus.COMPLETED },
          orderBy: { createdAt: 'desc' }
        });

    if (!targetRun) {
      return { run: null, daily: [] };
    }

    const where: any = { runId: targetRun.id };
    if (params.startDate || params.endDate) {
      where.date = {};
      if (params.startDate) where.date.gte = params.startDate;
      if (params.endDate) where.date.lte = params.endDate;
    }

    const daily = await dbClient.harmonizedDailySummary.findMany({
      where,
      orderBy: { date: 'asc' }
    });

    return { run: targetRun, daily };
  }

  public static async exportMatchesToCsv(
    params: { runId?: string; matchClass?: HarmonizationMatchClass },
    dbClient: typeof prisma = prisma
  ): Promise<string> {
    const targetRun = params.runId
      ? await dbClient.harmonizationRun.findUnique({ where: { id: params.runId } })
      : await dbClient.harmonizationRun.findFirst({
          where: { status: HarmonizationRunStatus.COMPLETED },
          orderBy: { createdAt: 'desc' }
        });

    if (!targetRun) {
      return 'observation_id,sensor,satellite,observation_time_utc,latitude,longitude,match_class,grid_cell_id,distance_m,time_diff_minutes,match_score,frp_mw,brightness_temp_k,confidence,source_dataset\r\n';
    }

    const where: any = { runId: targetRun.id };
    if (params.matchClass) {
      where.matchClass = params.matchClass;
    }

    const matches = await dbClient.harmonizedObservationMatch.findMany({
      where,
      include: {
        modisObservation: true,
        viirsObservation: true
      },
      orderBy: [{ acqDate: 'desc' }, { matchScore: 'desc' }]
    });

    const rows: string[] = [
      'observation_id,sensor,satellite,observation_time_utc,latitude,longitude,match_class,grid_cell_id,distance_m,time_diff_minutes,match_score,frp_mw,brightness_temp_k,confidence,source_dataset'
    ];

    for (const match of matches) {
      if (match.modisObservation) {
        const obs = match.modisObservation;
        rows.push(
          [
            escapeCsvValue(obs.id),
            escapeCsvValue(obs.sensor),
            escapeCsvValue(obs.satellitePlatform),
            escapeCsvValue(obs.observationTime ? obs.observationTime.toISOString() : ''),
            escapeCsvValue(obs.latitude),
            escapeCsvValue(obs.longitude),
            escapeCsvValue(match.matchClass),
            escapeCsvValue(match.gridCellId),
            escapeCsvValue(match.distanceM !== null ? match.distanceM : ''),
            escapeCsvValue(match.timeDiffMinutes !== null ? match.timeDiffMinutes : ''),
            escapeCsvValue(match.matchScore !== null ? match.matchScore : ''),
            escapeCsvValue(obs.frp !== null ? obs.frp : ''),
            escapeCsvValue(obs.brightnessTemp !== null ? obs.brightnessTemp : ''),
            escapeCsvValue(obs.confidence !== null ? obs.confidence : obs.confidenceRaw ?? obs.confidenceCategory ?? ''),
            escapeCsvValue(obs.sourceDataset)
          ].join(',')
        );
      }
      if (match.viirsObservation) {
        const obs = match.viirsObservation;
        rows.push(
          [
            escapeCsvValue(obs.id),
            escapeCsvValue(obs.sensor),
            escapeCsvValue(obs.satellitePlatform),
            escapeCsvValue(obs.observationTime ? obs.observationTime.toISOString() : ''),
            escapeCsvValue(obs.latitude),
            escapeCsvValue(obs.longitude),
            escapeCsvValue(match.matchClass),
            escapeCsvValue(match.gridCellId),
            escapeCsvValue(match.distanceM !== null ? match.distanceM : ''),
            escapeCsvValue(match.timeDiffMinutes !== null ? match.timeDiffMinutes : ''),
            escapeCsvValue(match.matchScore !== null ? match.matchScore : ''),
            escapeCsvValue(obs.frp !== null ? obs.frp : ''),
            escapeCsvValue(obs.brightnessTemp !== null ? obs.brightnessTemp : ''),
            escapeCsvValue(obs.confidenceRaw ?? obs.confidenceCategory ?? obs.confidence ?? ''),
            escapeCsvValue(obs.sourceDataset)
          ].join(',')
        );
      }
    }

    return rows.join('\r\n') + '\r\n';
  }

  public static async exportMatchesToGeoJson(
    params: { runId?: string; matchClass?: HarmonizationMatchClass },
    dbClient: typeof prisma = prisma
  ): Promise<{ type: 'FeatureCollection'; features: any[]; properties?: any }> {
    const targetRun = params.runId
      ? await dbClient.harmonizationRun.findUnique({ where: { id: params.runId } })
      : await dbClient.harmonizationRun.findFirst({
          where: { status: HarmonizationRunStatus.COMPLETED },
          orderBy: { createdAt: 'desc' }
        });

    if (!targetRun) {
      return {
        type: 'FeatureCollection',
        features: [],
        properties: {
          runId: null,
          totalFeatures: 0,
          exportedAt: new Date().toISOString()
        }
      };
    }

    const where: any = { runId: targetRun.id };
    if (params.matchClass) {
      where.matchClass = params.matchClass;
    }

    const matches = await dbClient.harmonizedObservationMatch.findMany({
      where,
      include: {
        modisObservation: true,
        viirsObservation: true
      },
      orderBy: [{ acqDate: 'desc' }, { matchScore: 'desc' }]
    });

    const features: any[] = [];

    for (const match of matches) {
      if (
        match.modisObservation &&
        Number.isFinite(match.modisObservation.latitude) &&
        Number.isFinite(match.modisObservation.longitude)
      ) {
        const obs = match.modisObservation;
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [obs.longitude, obs.latitude]
          },
          properties: {
            observationId: obs.id,
            matchId: match.id,
            matchKey: match.matchKey,
            matchClass: match.matchClass,
            sensor: obs.sensor,
            satellitePlatform: obs.satellitePlatform,
            observationTimeUtc: obs.observationTime ? obs.observationTime.toISOString() : null,
            gridCellId: match.gridCellId,
            spatialCrs: match.spatialCrs,
            distanceM: match.distanceM,
            timeDiffMinutes: match.timeDiffMinutes,
            matchScore: match.matchScore,
            frp: typeof obs.frp === 'number' ? obs.frp : null,
            frpMw: typeof obs.frp === 'number' ? obs.frp : null,
            brightnessTempK: obs.brightnessTemp ?? null,
            confidence: obs.confidence ?? obs.confidenceRaw ?? obs.confidenceCategory,
            sourceDataset: obs.sourceDataset
          }
        });
      }
      if (
        match.viirsObservation &&
        Number.isFinite(match.viirsObservation.latitude) &&
        Number.isFinite(match.viirsObservation.longitude)
      ) {
        const obs = match.viirsObservation;
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [obs.longitude, obs.latitude]
          },
          properties: {
            observationId: obs.id,
            matchId: match.id,
            matchKey: match.matchKey,
            matchClass: match.matchClass,
            sensor: obs.sensor,
            satellitePlatform: obs.satellitePlatform,
            observationTimeUtc: obs.observationTime ? obs.observationTime.toISOString() : null,
            gridCellId: match.gridCellId,
            spatialCrs: match.spatialCrs,
            distanceM: match.distanceM,
            timeDiffMinutes: match.timeDiffMinutes,
            matchScore: match.matchScore,
            frp: typeof obs.frp === 'number' ? obs.frp : null,
            frpMw: typeof obs.frp === 'number' ? obs.frp : null,
            brightnessTempK: obs.brightnessTemp ?? null,
            confidence: obs.confidenceRaw ?? obs.confidenceCategory ?? obs.confidence,
            sourceDataset: obs.sourceDataset
          }
        });
      }
    }

    return {
      type: 'FeatureCollection',
      features,
      properties: {
        runId: targetRun.id,
        regionName: targetRun.regionName,
        totalFeatures: features.length,
        exportedAt: new Date().toISOString()
      }
    };
  }

  public static async exportDailySummariesToCsv(
    params: { runId?: string },
    dbClient: typeof prisma = prisma
  ): Promise<string> {
    const targetRun = params.runId
      ? await dbClient.harmonizationRun.findUnique({ where: { id: params.runId } })
      : await dbClient.harmonizationRun.findFirst({
          where: { status: HarmonizationRunStatus.COMPLETED },
          orderBy: { createdAt: 'desc' }
        });

    if (!targetRun) {
      return 'date_utc,region_name,modis_count,viirs_count,candidate_match_count,modis_only_count,viirs_only_count,unique_grid_cells,modis_frp_sum_mw,modis_frp_mean_mw,modis_frp_max_mw,viirs_frp_sum_mw,viirs_frp_mean_mw,viirs_frp_max_mw\r\n';
    }

    const summaries = await dbClient.harmonizedDailySummary.findMany({
      where: { runId: targetRun.id },
      orderBy: { date: 'asc' }
    });

    const rows: string[] = [
      'date_utc,region_name,modis_count,viirs_count,candidate_match_count,modis_only_count,viirs_only_count,unique_grid_cells,modis_frp_sum_mw,modis_frp_mean_mw,modis_frp_max_mw,viirs_frp_sum_mw,viirs_frp_mean_mw,viirs_frp_max_mw'
    ];

    for (const d of summaries) {
      rows.push(
        [
          escapeCsvValue(d.date ? d.date.toISOString().slice(0, 10) : ''),
          escapeCsvValue(d.regionName),
          escapeCsvValue(d.modisCount),
          escapeCsvValue(d.viirsCount),
          escapeCsvValue(d.candidateMatchCount),
          escapeCsvValue(d.modisOnlyCount),
          escapeCsvValue(d.viirsOnlyCount),
          escapeCsvValue(d.uniqueGridCells),
          escapeCsvValue(d.modisFrpSumMw !== null ? d.modisFrpSumMw : ''),
          escapeCsvValue(d.modisFrpMeanMw !== null ? d.modisFrpMeanMw : ''),
          escapeCsvValue(d.modisFrpMaxMw !== null ? d.modisFrpMaxMw : ''),
          escapeCsvValue(d.viirsFrpSumMw !== null ? d.viirsFrpSumMw : ''),
          escapeCsvValue(d.viirsFrpMeanMw !== null ? d.viirsFrpMeanMw : ''),
          escapeCsvValue(d.viirsFrpMaxMw !== null ? d.viirsFrpMaxMw : '')
        ].join(',')
      );
    }

    return rows.join('\r\n') + '\r\n';
  }
}

export function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

