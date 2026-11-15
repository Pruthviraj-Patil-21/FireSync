import axios from 'axios';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { FireStatus, IngestionStatus } from '@prisma/client';

export const VERIFIED_FIRMS_SOURCES = new Set([
  'MODIS_NRT',
  'MODIS_SP',
  'VIIRS_SNPP_NRT',
  'VIIRS_SNPP_SP',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA20_SP',
  'VIIRS_NOAA21_NRT'
]);

export type ConfidenceCategory = 'LOW' | 'NOMINAL' | 'HIGH';
export type SensorFamily = 'MODIS' | 'VIIRS' | 'UNKNOWN';

export interface RawObservationInput {
  latitude: number;
  longitude: number;
  observationTime: Date;
  acquisitionDate: Date;
  satellitePlatform: string;
  satelliteCode?: string | null;
  sensor: string;
  confidence?: number | null;
  confidenceRaw?: string | null;
  confidenceCategory?: ConfidenceCategory | null;
  brightnessTemp?: number;
  brightnessTemp31?: number;
  frp?: number;
  scan?: number;
  track?: number;
  dayNight?: string;
  version?: string;
  sourceDataset: string;
  sourceId?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

export interface FirmsUrlOptions {
  baseUrl?: string;
  mapKey: string;
  source: string;
  queryMode?: 'country' | 'area';
  countryCode?: string;
  areaBbox?: string;
  dayRange?: number;
  date?: string;
}

export interface ParsedFirmsCsvResult {
  records: RawObservationInput[];
  totalRows: number;
  skippedCount: number;
  errors: string[];
}

export interface SyncJobSourceResult {
  source: string;
  status: 'SUCCESS' | 'PARTIAL' | 'EMPTY' | 'FAILED' | 'SKIPPED';
  recordsReceived: number;
  inserted: number;
  updated: number;
  failed: number;
  skippedParsing: number;
  error?: string;
}

export interface SyncJobSummary {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  reason?: string;
  sources: SyncJobSourceResult[];
}

export interface SyncJobDependencies {
  mapKey?: string;
  baseUrl?: string;
  queryMode?: 'country' | 'area';
  countryCode?: string;
  areaBbox?: string;
  sources?: string[];
  dayRange?: number;
  date?: string;
  timeoutMs?: number;
  httpGet?: (url: string, config?: { timeout?: number }) => Promise<{ status?: number; data: unknown }>;
  dbClient?: typeof prisma;
}

// Calculate Haversine distance between two coordinates in kilometers
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Parses NASA FIRMS acquisition date (YYYY-MM-DD) and acquisition time (HHMM in UTC)
 * into strict UTC Date objects. Never falls back to current server time.
 */
export function parseFirmsAcquisitionTimestamp(
  acqDateRaw?: string | null,
  acqTimeRaw?: string | null
): { observationTime: Date; acquisitionDate: Date } | null {
  if (!acqDateRaw || !acqTimeRaw) return null;

  const dateStr = acqDateRaw.trim();
  const timeStr = acqTimeRaw.trim();

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dateMatch) return null;

  if (!/^\d{1,4}$/.test(timeStr)) return null;
  const paddedTime = timeStr.padStart(4, '0');
  const hour = Number(paddedTime.slice(0, 2));
  const minute = Number(paddedTime.slice(2, 4));

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const observationTime = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const acquisitionDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  // Guard against calendar rollover (e.g. 2026-02-30 -> March 2)
  if (
    Number.isNaN(observationTime.getTime()) ||
    observationTime.getUTCFullYear() !== year ||
    observationTime.getUTCMonth() !== month - 1 ||
    observationTime.getUTCDate() !== day ||
    observationTime.getUTCHours() !== hour ||
    observationTime.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return { observationTime, acquisitionDate };
}

/**
 * Identifies sensor family (MODIS/VIIRS), satellite platform identity, and preserves
 * original FIRMS satellite code using verified FIRMS source/CSV documentation.
 */
export function identifyFirmsSensorAndPlatform(
  source: string,
  satelliteRaw?: string | null,
  instrumentRaw?: string | null
): { sensor: SensorFamily; satellitePlatform: string; satelliteCode: string | null } {
  const sourceUpper = (source || '').trim().toUpperCase();
  const satTrimmed = (satelliteRaw ?? '').trim();
  const satUpper = satTrimmed.toUpperCase();
  const instUpper = (instrumentRaw ?? '').trim().toUpperCase();

  let sensor: SensorFamily = 'UNKNOWN';
  if (sourceUpper.startsWith('MODIS') || instUpper === 'MODIS') {
    sensor = 'MODIS';
  } else if (sourceUpper.startsWith('VIIRS') || instUpper === 'VIIRS') {
    sensor = 'VIIRS';
  }

  let satellitePlatform = 'Unknown';
  if (satUpper === 'T' || satUpper === 'TERRA') {
    satellitePlatform = 'Terra';
  } else if (satUpper === 'A' || satUpper === 'AQUA') {
    satellitePlatform = 'Aqua';
  } else if (satUpper === 'N' || satUpper === 'NPP' || satUpper === 'SUOMI-NPP' || satUpper === 'S-NPP') {
    satellitePlatform = 'Suomi-NPP';
  } else if (satUpper === 'N20' || satUpper === 'NOAA-20' || satUpper === 'NOAA20' || satUpper === 'J1' || satUpper === 'JPSS-1') {
    satellitePlatform = 'NOAA-20';
  } else if (satUpper === 'N21' || satUpper === 'NOAA-21' || satUpper === 'NOAA21' || satUpper === 'J2' || satUpper === 'JPSS-2') {
    satellitePlatform = 'NOAA-21';
  } else if (satUpper === '1' && sourceUpper.includes('NOAA20')) {
    satellitePlatform = 'NOAA-20';
  } else if (satUpper === '2' && sourceUpper.includes('NOAA21')) {
    satellitePlatform = 'NOAA-21';
  } else if (sourceUpper.includes('SNPP')) {
    satellitePlatform = 'Suomi-NPP';
  } else if (sourceUpper.includes('NOAA20')) {
    satellitePlatform = 'NOAA-20';
  } else if (sourceUpper.includes('NOAA21')) {
    satellitePlatform = 'NOAA-21';
  } else if (sensor === 'MODIS') {
    satellitePlatform = satTrimmed ? `Unknown MODIS (${satTrimmed})` : 'Unknown MODIS';
  } else if (sensor === 'VIIRS') {
    satellitePlatform = satTrimmed ? `Unknown VIIRS (${satTrimmed})` : 'Unknown VIIRS';
  }

  return {
    sensor,
    satellitePlatform,
    satelliteCode: satTrimmed || null
  };
}

/**
 * Parses FIRMS confidence preserving raw value and normalized categorical tier
 * without applying parseFloat() to categorical strings or inventing arbitrary defaults.
 */
export function parseFirmsConfidence(
  sensor: SensorFamily | string,
  confidenceRaw?: string | null
): {
  confidenceNumeric: number | null;
  confidenceRaw: string | null;
  confidenceCategory: ConfidenceCategory | null;
} {
  const rawTrimmed = (confidenceRaw ?? '').trim();
  if (!rawTrimmed) {
    return { confidenceNumeric: null, confidenceRaw: null, confidenceCategory: null };
  }

  const lower = rawTrimmed.toLowerCase();
  if (lower === 'l' || lower === 'low') {
    return { confidenceNumeric: null, confidenceRaw: rawTrimmed, confidenceCategory: 'LOW' };
  }
  if (lower === 'n' || lower === 'nominal') {
    return { confidenceNumeric: null, confidenceRaw: rawTrimmed, confidenceCategory: 'NOMINAL' };
  }
  if (lower === 'h' || lower === 'high') {
    return { confidenceNumeric: null, confidenceRaw: rawTrimmed, confidenceCategory: 'HIGH' };
  }

  if (/^\d+(\.\d+)?$/.test(rawTrimmed)) {
    const num = Number(rawTrimmed);
    if (Number.isFinite(num) && num >= 0 && num <= 100) {
      let confidenceCategory: ConfidenceCategory = 'NOMINAL';
      if (num < 30) confidenceCategory = 'LOW';
      else if (num >= 80) confidenceCategory = 'HIGH';

      return {
        confidenceNumeric: num,
        confidenceRaw: rawTrimmed,
        confidenceCategory
      };
    }
  }

  // Invalid / unrecognized confidence string: preserve raw value, do not invent numeric score
  void sensor;
  return {
    confidenceNumeric: null,
    confidenceRaw: rawTrimmed,
    confidenceCategory: null
  };
}

/**
 * Builds an official NASA FIRMS CSV endpoint URL for Country or Area queries.
 */
export function buildFirmsRequestUrl(options: FirmsUrlOptions): string {
  const baseUrl = (options.baseUrl || env.FIRMS_API_BASE_URL || 'https://firms.modaps.eosdis.nasa.gov/api').replace(/\/+$/, '');
  const mapKey = options.mapKey.trim();
  const source = options.source.trim();

  if (!mapKey) {
    throw new Error('NASA_FIRMS_MAP_KEY is required to build a FIRMS API URL');
  }
  if (!VERIFIED_FIRMS_SOURCES.has(source)) {
    throw new Error(`Unverified or unsupported FIRMS source: ${source}`);
  }

  const dayRange = Math.min(10, Math.max(1, Math.trunc(options.dayRange ?? env.FIRMS_DAY_RANGE ?? 1)));
  const mode = options.queryMode ?? env.FIRMS_QUERY_MODE ?? 'country';
  const dateSuffix = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date.trim()) ? `/${options.date.trim()}` : '';

  if (mode === 'area') {
    const bbox = (options.areaBbox ?? env.FIRMS_AREA_BBOX ?? '68.0,6.5,97.5,37.5').trim();
    if (bbox.toLowerCase() !== 'world') {
      const parts = bbox.split(',').map((p) => Number(p.trim()));
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        throw new Error(`Invalid FIRMS_AREA_BBOX format: ${bbox}. Expected "west,south,east,north" or "world".`);
      }
    }
    return `${baseUrl}/area/csv/${encodeURIComponent(mapKey)}/${source}/${bbox}/${dayRange}${dateSuffix}`;
  }

  const countryCode = (options.countryCode ?? env.FIRMS_COUNTRY_CODE ?? 'IND').trim().toUpperCase();
  if (!/^[A-Z]{2,10}$/.test(countryCode)) {
    throw new Error(`Invalid FIRMS_COUNTRY_CODE: ${countryCode}`);
  }
  return `${baseUrl}/country/csv/${encodeURIComponent(mapKey)}/${source}/${countryCode}/${dayRange}${dateSuffix}`;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseOptionalFiniteNumber(raw: string | undefined, min?: number): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return undefined;
  if (min !== undefined && num < min) return undefined;
  return num;
}

function normalizeDayNight(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toUpperCase();
  if (trimmed === 'D' || trimmed === 'DAY') return 'Day';
  if (trimmed === 'N' || trimmed === 'NIGHT') return 'Night';
  return raw.trim() || undefined;
}

/**
 * Parses NASA FIRMS CSV response into validated RawObservationInput records.
 * Rejects malformed/invalid rows individually and throws on FIRMS API text errors.
 */
export function parseFirmsCsv(csvText: string, source: string): ParsedFirmsCsvResult {
  const trimmed = (csvText || '').trim();
  if (!trimmed || /^no\s+data/i.test(trimmed)) {
    return { records: [], totalRows: 0, skippedCount: 0, errors: [] };
  }

  // NASA FIRMS sometimes returns HTTP 200 with a plain-text API error message
  const firstLine = trimmed.split(/\r?\n/)[0].trim();
  if (
    /^(invalid\s+map_key|invalid\s+source|invalid\s+area|invalid\s+country|exceeded\s+maximum|error[:\s])/i.test(firstLine)
  ) {
    throw new Error(`NASA FIRMS API error: ${firstLine}`);
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { records: [], totalRows: 0, skippedCount: 0, errors: [] };
  }

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const acqDateIdx = headers.indexOf('acq_date');
  const acqTimeIdx = headers.indexOf('acq_time');

  if (latIdx === -1 || lonIdx === -1 || acqDateIdx === -1 || acqTimeIdx === -1) {
    throw new Error(`Unexpected FIRMS CSV header format for ${source}: missing required columns`);
  }

  const frpIdx = headers.indexOf('frp');
  const confIdx = headers.indexOf('confidence');
  const satIdx = headers.indexOf('satellite');
  const instIdx = headers.indexOf('instrument');
  const brightModisIdx = headers.indexOf('brightness');
  const brightViirsIdx = headers.indexOf('bright_ti4');
  const bright31Idx = headers.indexOf('bright_t31');
  const brightTi5Idx = headers.indexOf('bright_ti5');
  const scanIdx = headers.indexOf('scan');
  const trackIdx = headers.indexOf('track');
  const dayNightIdx = headers.indexOf('daynight');
  const versionIdx = headers.indexOf('version');

  const records: RawObservationInput[] = [];
  const errors: string[] = [];
  let skippedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < headers.length) {
      skippedCount++;
      errors.push(`Row ${i}: column count mismatch (${cols.length} < ${headers.length})`);
      continue;
    }

    const latRaw = cols[latIdx];
    const lonRaw = cols[lonIdx];
    const lat = Number(latRaw);
    const lon = Number(lonRaw);

    if (!latRaw || !lonRaw || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      skippedCount++;
      errors.push(`Row ${i}: invalid coordinates (${latRaw}, ${lonRaw})`);
      continue;
    }

    const acqDateRaw = cols[acqDateIdx];
    const acqTimeRaw = cols[acqTimeIdx];
    const parsedTs = parseFirmsAcquisitionTimestamp(acqDateRaw, acqTimeRaw);
    if (!parsedTs) {
      skippedCount++;
      errors.push(`Row ${i}: invalid acquisition timestamp (date='${acqDateRaw}', time='${acqTimeRaw}')`);
      continue;
    }

    const satRaw = satIdx !== -1 ? cols[satIdx] : undefined;
    const instRaw = instIdx !== -1 ? cols[instIdx] : undefined;
    const { sensor, satellitePlatform, satelliteCode } = identifyFirmsSensorAndPlatform(source, satRaw, instRaw);

    const confRaw = confIdx !== -1 ? cols[confIdx] : undefined;
    const { confidenceNumeric, confidenceRaw, confidenceCategory } = parseFirmsConfidence(sensor, confRaw);

    const brightPrimaryRaw =
      brightViirsIdx !== -1 ? cols[brightViirsIdx] : brightModisIdx !== -1 ? cols[brightModisIdx] : undefined;
    const brightSecondaryRaw =
      brightTi5Idx !== -1 ? cols[brightTi5Idx] : bright31Idx !== -1 ? cols[bright31Idx] : undefined;

    const brightnessTemp = parseOptionalFiniteNumber(brightPrimaryRaw, 0.01);
    const brightnessTemp31 = parseOptionalFiniteNumber(brightSecondaryRaw, 0.01);
    const frp = parseOptionalFiniteNumber(frpIdx !== -1 ? cols[frpIdx] : undefined, 0);
    const scan = parseOptionalFiniteNumber(scanIdx !== -1 ? cols[scanIdx] : undefined, 0.001);
    const track = parseOptionalFiniteNumber(trackIdx !== -1 ? cols[trackIdx] : undefined, 0.001);
    const dayNight = normalizeDayNight(dayNightIdx !== -1 ? cols[dayNightIdx] : undefined);
    const version = versionIdx !== -1 && cols[versionIdx] ? cols[versionIdx] : undefined;

    const sourceId = buildDeterministicSourceId(
      source,
      satelliteCode || satellitePlatform,
      lat,
      lon,
      parsedTs.observationTime
    );

    records.push({
      latitude: lat,
      longitude: lon,
      observationTime: parsedTs.observationTime,
      acquisitionDate: parsedTs.acquisitionDate,
      satellitePlatform,
      satelliteCode,
      sensor,
      confidence: confidenceNumeric,
      confidenceRaw,
      confidenceCategory,
      brightnessTemp,
      brightnessTemp31,
      frp,
      scan,
      track,
      dayNight,
      version,
      sourceDataset: source,
      sourceId,
      metadata: {
        firmsSource: source,
        instrument: instRaw || sensor,
        acqDateRaw,
        acqTimeRaw,
        dayNightRaw: dayNightIdx !== -1 ? cols[dayNightIdx] : undefined
      }
    });
  }

  return {
    records,
    totalRows: Math.max(0, lines.length - 1),
    skippedCount,
    errors
  };
}

export function buildDeterministicSourceId(
  sourceDataset: string,
  platformOrCode: string,
  latitude: number,
  longitude: number,
  observationTime: Date
): string {
  const cleanSource = sourceDataset.replace(/[^A-Za-z0-9_-]/g, '');
  const cleanPlatform = platformOrCode.replace(/[^A-Za-z0-9_-]/g, '');
  return `firms_${cleanSource}_${cleanPlatform}_${latitude.toFixed(5)}_${longitude.toFixed(5)}_${observationTime.toISOString()}`;
}

export class FirmsIngestionService {
  /**
   * Spatial & Temporal Clustering:
   * Groups fire observations within 15 km and 24 hours into FireIncident records.
   * Computes centroid, observation count, peak FRP, and total FRP without fabricating perimeters.
   */
  public static async clusterAndAssignIncidents(
    observationIds?: string[],
    dbClient: typeof prisma = prisma
  ): Promise<number> {
    const timeThresholdHours = 24;
    const distanceThresholdKm = 15;

    const observations = await dbClient.fireObservation.findMany({
      where: observationIds ? { id: { in: observationIds } } : undefined,
      orderBy: { observationTime: 'desc' },
      take: 2000
    });

    if (observations.length === 0) return 0;

    let clusteredCount = 0;

    for (const obs of observations) {
      if (obs.incidentId) continue;

      const existingIncidents = await dbClient.fireIncident.findMany({
        where: {
          lastObservedAt: {
            gte: new Date(obs.observationTime.getTime() - timeThresholdHours * 3600 * 1000)
          }
        }
      });

      let matchedIncident = null;
      for (const incident of existingIncidents) {
        const dist = haversineDistanceKm(obs.latitude, obs.longitude, incident.latitude, incident.longitude);
        if (dist <= distanceThresholdKm) {
          matchedIncident = incident;
          break;
        }
      }

      if (matchedIncident) {
        const currentCount = matchedIncident.observationCount;
        const newCount = currentCount + 1;
        const newLat = (matchedIncident.latitude * currentCount + obs.latitude) / newCount;
        const newLon = (matchedIncident.longitude * currentCount + obs.longitude) / newCount;
        const newTotalFrp = (matchedIncident.totalFrp || 0) + (obs.frp || 0);
        const newPeakFrp = Math.max(matchedIncident.peakFrp || 0, obs.frp || 0);

        await dbClient.fireIncident.update({
          where: { id: matchedIncident.id },
          data: {
            latitude: Number(newLat.toFixed(4)),
            longitude: Number(newLon.toFixed(4)),
            observationCount: newCount,
            totalFrp: Number(newTotalFrp.toFixed(1)),
            peakFrp: Number(newPeakFrp.toFixed(1)),
            lastObservedAt: obs.observationTime > matchedIncident.lastObservedAt ? obs.observationTime : matchedIncident.lastObservedAt
          }
        });

        await dbClient.fireObservation.update({
          where: { id: obs.id },
          data: { incidentId: matchedIncident.id }
        });
        clusteredCount++;
      } else {
        const incidentName = `INC-${obs.satellitePlatform.substring(0, 3).toUpperCase()}-${Math.abs(Math.round(obs.latitude))}${obs.latitude >= 0 ? 'N' : 'S'}-${Math.abs(Math.round(obs.longitude))}${obs.longitude >= 0 ? 'E' : 'W'}`;
        const newIncident = await dbClient.fireIncident.create({
          data: {
            name: incidentName,
            latitude: obs.latitude,
            longitude: obs.longitude,
            firstObservedAt: obs.observationTime,
            lastObservedAt: obs.observationTime,
            status: FireStatus.ACTIVE,
            observationCount: 1,
            peakFrp: obs.frp || 0,
            totalFrp: obs.frp || 0,
            estimatedPerimeter: {
              type: 'PointClusterRadius',
              center: [obs.latitude, obs.longitude],
              nominalRadiusKm: 5
            }
          }
        });

        await dbClient.fireObservation.update({
          where: { id: obs.id },
          data: { incidentId: newIncident.id }
        });
        clusteredCount++;
      }
    }

    return clusteredCount;
  }

  /**
   * Ingest validated observations into PostgreSQL using deterministic deduplication,
   * chunked transactions, and accurate inserted/updated/failed counters.
   */
  public static async ingestObservations(
    sourceName: string,
    records: RawObservationInput[],
    options?: { dbClient?: typeof prisma; skippedParsing?: number }
  ): Promise<{ inserted: number; updated: number; failed: number }> {
    const dbClient = options?.dbClient ?? prisma;
    const skippedParsing = options?.skippedParsing ?? 0;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startTime = new Date();

    const logEntry = await dbClient.dataIngestionLog.create({
      data: {
        source: sourceName,
        jobId,
        startTime,
        recordsReceived: records.length + skippedParsing,
        status: IngestionStatus.RUNNING
      }
    });

    let inserted = 0;
    let updated = 0;
    let failed = skippedParsing;
    const validRecordsMap = new Map<string, { record: RawObservationInput; sourceId: string }>();

    for (const record of records) {
      if (
        !Number.isFinite(record.latitude) ||
        !Number.isFinite(record.longitude) ||
        record.latitude < -90 ||
        record.latitude > 90 ||
        record.longitude < -180 ||
        record.longitude > 180 ||
        !(record.observationTime instanceof Date) ||
        Number.isNaN(record.observationTime.getTime()) ||
        !(record.acquisitionDate instanceof Date) ||
        Number.isNaN(record.acquisitionDate.getTime())
      ) {
        failed++;
        continue;
      }

      const sourceId =
        record.sourceId ||
        buildDeterministicSourceId(
          record.sourceDataset,
          record.satelliteCode || record.satellitePlatform,
          record.latitude,
          record.longitude,
          record.observationTime
        );

      // Deduplicate within the same payload batch
      validRecordsMap.set(sourceId, { record, sourceId });
    }

    const dedupedBatch = Array.from(validRecordsMap.values());
    const touchedIds: string[] = [];
    const CHUNK_SIZE = 100;

    for (let i = 0; i < dedupedBatch.length; i += CHUNK_SIZE) {
      const chunk = dedupedBatch.slice(i, i + CHUNK_SIZE);
      const chunkSourceIds = chunk.map((c) => c.sourceId);

      try {
        const existingRows = await dbClient.fireObservation.findMany({
          where: { sourceId: { in: chunkSourceIds } },
          select: { sourceId: true }
        });
        const existingSet = new Set(existingRows.map((r) => r.sourceId).filter((id): id is string => Boolean(id)));

        const upsertedRows = await dbClient.$transaction(
          chunk.map(({ record, sourceId }) => {
            const normalizedConfidence =
              record.confidence !== undefined && record.confidence !== null && Number.isFinite(record.confidence)
                ? Math.min(100, Math.max(0, record.confidence))
                : null;
            const frp = record.frp !== undefined && Number.isFinite(record.frp) ? Math.max(0, record.frp) : null;

            return dbClient.fireObservation.upsert({
              where: { sourceId },
              update: {
                confidence: normalizedConfidence,
                confidenceRaw: record.confidenceRaw ?? null,
                confidenceCategory: record.confidenceCategory ?? null,
                frp,
                brightnessTemp: record.brightnessTemp ?? null,
                brightnessTemp31: record.brightnessTemp31 ?? null,
                scan: record.scan ?? null,
                track: record.track ?? null,
                dayNight: record.dayNight ?? null,
                version: record.version ?? null,
                metadata: (record.metadata as any) ?? undefined
              },
              create: {
                latitude: record.latitude,
                longitude: record.longitude,
                observationTime: record.observationTime,
                acquisitionDate: record.acquisitionDate,
                satellitePlatform: record.satellitePlatform,
                satelliteCode: record.satelliteCode ?? null,
                sensor: record.sensor,
                confidence: normalizedConfidence,
                confidenceRaw: record.confidenceRaw ?? null,
                confidenceCategory: record.confidenceCategory ?? null,
                brightnessTemp: record.brightnessTemp ?? null,
                brightnessTemp31: record.brightnessTemp31 ?? null,
                frp,
                scan: record.scan ?? null,
                track: record.track ?? null,
                dayNight: record.dayNight ?? null,
                version: record.version ?? null,
                sourceDataset: record.sourceDataset,
                sourceId,
                metadata: (record.metadata as any) ?? undefined
              }
            });
          })
        );

        for (const item of chunk) {
          if (existingSet.has(item.sourceId)) updated++;
          else inserted++;
        }
        for (const row of upsertedRows) {
          touchedIds.push(row.id);
        }
      } catch (chunkErr: unknown) {
        failed += chunk.length;
        logger.warn(`Failed transaction chunk during FIRMS ingestion [${sourceName}]: ${chunkErr instanceof Error ? chunkErr.message : String(chunkErr)}`);
      }
    }

    if (touchedIds.length > 0) {
      try {
        await this.clusterAndAssignIncidents(touchedIds, dbClient);
      } catch (clusterErr) {
        logger.error(`Clustering error during ingestion: ${clusterErr}`);
      }
    }

    const endTime = new Date();
    const finalStatus =
      failed === 0
        ? IngestionStatus.SUCCESS
        : inserted + updated > 0
          ? IngestionStatus.PARTIAL
          : IngestionStatus.FAILED;

    await dbClient.dataIngestionLog.update({
      where: { id: logEntry.id },
      data: {
        endTime,
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsFailed: failed,
        status: finalStatus
      }
    });

    logger.info(
      `Ingestion [${sourceName}] completed (${finalStatus}): ${inserted} inserted, ${updated} updated, ${failed} failed in ${endTime.getTime() - startTime.getTime()}ms`
    );

    return { inserted, updated, failed };
  }

  /**
   * Executes live NASA FIRMS synchronization for configured sources and region.
   * Never fabricates or inserts mock observations if MAP_KEY is missing or API fails.
   */
  public static async executeSyncJob(deps: SyncJobDependencies = {}): Promise<SyncJobSummary> {
    const mapKey = (deps.mapKey ?? env.NASA_FIRMS_MAP_KEY ?? '').trim();
    const dbClient = deps.dbClient ?? prisma;
    const httpGet = deps.httpGet ?? ((url: string, config?: { timeout?: number }) => axios.get(url, config));
    const timeoutMs = deps.timeoutMs ?? env.FIRMS_REQUEST_TIMEOUT_MS ?? 15000;

    if (!mapKey) {
      logger.warn('NASA_FIRMS_MAP_KEY is not configured. Skipping live NASA FIRMS ingestion (no mock data will be inserted).');
      return {
        status: 'SKIPPED',
        reason: 'NASA_FIRMS_MAP_KEY is not configured',
        sources: []
      };
    }

    const configuredSources =
      deps.sources ??
      (env.FIRMS_SOURCES || 'MODIS_NRT,VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const results: SyncJobSourceResult[] = [];

    for (const source of configuredSources) {
      if (!VERIFIED_FIRMS_SOURCES.has(source)) {
        logger.warn(`Skipping unverified FIRMS source identifier: ${source}`);
        results.push({
          source,
          status: 'SKIPPED',
          recordsReceived: 0,
          inserted: 0,
          updated: 0,
          failed: 0,
          skippedParsing: 0,
          error: `Unverified source identifier: ${source}`
        });
        continue;
      }

      const startTime = new Date();
      try {
        const url = buildFirmsRequestUrl({
          baseUrl: deps.baseUrl ?? env.FIRMS_API_BASE_URL,
          mapKey,
          source,
          queryMode: deps.queryMode ?? env.FIRMS_QUERY_MODE,
          countryCode: deps.countryCode ?? env.FIRMS_COUNTRY_CODE,
          areaBbox: deps.areaBbox ?? env.FIRMS_AREA_BBOX,
          dayRange: deps.dayRange ?? env.FIRMS_DAY_RANGE,
          date: deps.date ?? env.FIRMS_DATE
        });

        const response = await httpGet(url, { timeout: timeoutMs });
        if (typeof response.data !== 'string') {
          throw new Error(`Expected CSV string payload from FIRMS for ${source}, got ${typeof response.data}`);
        }

        const parsed = parseFirmsCsv(response.data, source);
        if (parsed.errors.length > 0) {
          logger.warn(`FIRMS CSV parsing skipped ${parsed.skippedCount} malformed row(s) for ${source}: ${parsed.errors.slice(0, 3).join('; ')}`);
        }

        if (parsed.records.length === 0 && parsed.skippedCount === 0) {
          await dbClient.dataIngestionLog.create({
            data: {
              source,
              jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              startTime,
              endTime: new Date(),
              recordsReceived: 0,
              recordsInserted: 0,
              recordsUpdated: 0,
              recordsFailed: 0,
              status: IngestionStatus.SUCCESS,
              metadata: { note: 'Empty FIRMS API response (0 active fire detections)' }
            }
          });

          results.push({
            source,
            status: 'EMPTY',
            recordsReceived: 0,
            inserted: 0,
            updated: 0,
            failed: 0,
            skippedParsing: 0
          });
          continue;
        }

        const stats = await this.ingestObservations(source, parsed.records, {
          dbClient,
          skippedParsing: parsed.skippedCount
        });

        results.push({
          source,
          status: stats.failed === 0 ? 'SUCCESS' : stats.inserted + stats.updated > 0 ? 'PARTIAL' : 'FAILED',
          recordsReceived: parsed.totalRows,
          inserted: stats.inserted,
          updated: stats.updated,
          failed: stats.failed,
          skippedParsing: parsed.skippedCount
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const statusCode = (err as { response?: { status?: number } })?.response?.status;
        const formattedError = statusCode === 429 ? `NASA FIRMS API rate limit exceeded (HTTP 429): ${message}` : message;

        logger.error(`NASA FIRMS ingestion failed for ${source}: ${formattedError}`);

        try {
          await dbClient.dataIngestionLog.create({
            data: {
              source,
              jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              startTime,
              endTime: new Date(),
              recordsReceived: 0,
              recordsInserted: 0,
              recordsUpdated: 0,
              recordsFailed: 0,
              status: IngestionStatus.FAILED,
              errorMessage: formattedError
            }
          });
        } catch (logErr) {
          logger.error(`Failed to persist ingestion failure log for ${source}: ${logErr}`);
        }

        results.push({
          source,
          status: 'FAILED',
          recordsReceived: 0,
          inserted: 0,
          updated: 0,
          failed: 0,
          skippedParsing: 0,
          error: formattedError
        });
      }
    }

    const failedCount = results.filter((r) => r.status === 'FAILED').length;
    const successCount = results.filter((r) => r.status === 'SUCCESS' || r.status === 'EMPTY').length;

    let overallStatus: SyncJobSummary['status'] = 'COMPLETED';
    if (results.length > 0 && failedCount === results.length) {
      overallStatus = 'FAILED';
    } else if (failedCount > 0 || results.some((r) => r.status === 'PARTIAL')) {
      overallStatus = successCount > 0 ? 'PARTIAL' : 'FAILED';
    }

    return { status: overallStatus, sources: results };
  }
}
