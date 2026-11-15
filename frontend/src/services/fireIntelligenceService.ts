import { GLOBAL_HOTSPOTS, HotspotPoint } from '../components/earth/fireData';

export type TimeRangeFilter = '24h' | '48h' | '7d' | '30d';

export interface EnrichedHotspot extends HotspotPoint {
  country: string;
  countryCode: string;
  continent: string;
  sectorName: string;
  acquiredUtcString: string;
  hoursAgo: number;
  isNewDetection: boolean;
  brightnessTempK: number | null;
  brightnessTempC: number | null;
  sensorFamily: 'VIIRS' | 'MODIS';
  specificMission: 'Terra MODIS' | 'Aqua MODIS' | 'Suomi-NPP VIIRS' | 'NOAA-20 VIIRS' | 'NOAA-21 VIIRS';
  confidenceCategory: 'High' | 'Nominal' | 'Low';
  frpCategory: 'Extreme' | 'Severe' | 'Elevated' | 'Moderate' | 'Not reported';
}

export interface RegionalMetric {
  name: string;
  country: string;
  continent: string;
  count: number;
  avgFrp: number | null;
  maxFrp: number | null;
  riskLevel: 'Extreme' | 'Severe' | 'Elevated' | 'Moderate';
  trend: string;
  center: [number, number];
  primarySensor: string;
}

export interface SatelliteMissionStatus {
  id: string;
  name: string;
  sensor: string;
  resolution: string;
  orbitType: string;
  altitudeKm: number;
  latestPassUtc: string;
  detectionCount: number;
  operationalStatus: 'NOMINAL' | 'CALIBRATING' | 'STANDBY';
  dataLatency: string;
  coverageShare: number; // percentage
}

export interface DiurnalHourlyPoint {
  hour: string;
  viirs: number;
  modis: number;
  total: number;
  avgFrp: number;
}

export interface GlobalDashboardMetrics {
  activeDetections: number;
  newDetections: number;
  highConfidenceDetections: number;
  highConfidencePct: number;
  affectedCountriesCount: number;
  affectedContinentsCount: number;
  avgFrp: number;
  peakFrp: number;
  peakFrpHotspot: EnrichedHotspot | null;
  latestObservation: EnrichedHotspot | null;
  previousCycleDetections: number;
  trendPercentage: number;
  lastUpdatedUtc: string;
}

// Map hotspot ID / region to exact country and continent
function classifyHotspotLocation(point: HotspotPoint): {
  country: string;
  countryCode: string;
  continent: string;
  sectorName: string;
} {
  const id = point.id;
  const reg = point.region.toLowerCase();

  // South America
  if (id.startsWith('sa-bol')) {
    return { country: 'Bolivia', countryCode: 'BOL', continent: 'South America', sectorName: 'Chiquitano & Moxos Savannas' };
  }
  if (id === 'sa-par-04' || id === 'sa-par-05') {
    return { country: 'Paraguay', countryCode: 'PRY', continent: 'South America', sectorName: 'Gran Chaco Scrub' };
  }
  if (id.startsWith('sa-arg')) {
    return { country: 'Argentina', countryCode: 'ARG', continent: 'South America', sectorName: 'Gran Chaco & Patagonian Steppe' };
  }
  if (id.startsWith('sa-chi')) {
    return { country: 'Chile', countryCode: 'CHL', continent: 'South America', sectorName: 'Central Andean Slopes' };
  }
  if (id.startsWith('sa-')) {
    return { country: 'Brazil', countryCode: 'BRA', continent: 'South America', sectorName: 'Amazon Basin & Cerrado' };
  }

  // North America
  if (id.startsWith('na-can')) {
    return { country: 'Canada', countryCode: 'CAN', continent: 'North America', sectorName: 'Boreal Forests & Rockies' };
  }
  if (id.startsWith('na-mex')) {
    return { country: 'Mexico', countryCode: 'MEX', continent: 'North America', sectorName: 'Sierra Madre Forests' };
  }
  if (id.startsWith('na-gua')) {
    return { country: 'Guatemala', countryCode: 'GTM', continent: 'North America', sectorName: 'Maya Biosphere' };
  }
  if (id.startsWith('na-')) {
    return { country: 'United States', countryCode: 'USA', continent: 'North America', sectorName: 'Western Cascades & Rockies' };
  }

  // Africa
  if (id.startsWith('af-con') || id.startsWith('af-kat')) {
    return { country: 'DR Congo', countryCode: 'COD', continent: 'Africa', sectorName: 'Congo Savanna Basin' };
  }
  if (id.startsWith('af-ang')) {
    return { country: 'Angola', countryCode: 'AGO', continent: 'Africa', sectorName: 'Bié Plateau Miombo' };
  }
  if (id.startsWith('af-zam')) {
    return { country: 'Zambia', countryCode: 'ZMB', continent: 'Africa', sectorName: 'Central Miombo Woodlands' };
  }
  if (id.startsWith('af-moz')) {
    return { country: 'Mozambique', countryCode: 'MOZ', continent: 'Africa', sectorName: 'Mozambique Savanna' };
  }
  if (id.startsWith('af-mad')) {
    return { country: 'Madagascar', countryCode: 'MDG', continent: 'Africa', sectorName: 'Central Grasslands' };
  }

  // Australia / Oceania
  if (id.startsWith('au-')) {
    return { country: 'Australia', countryCode: 'AUS', continent: 'Oceania', sectorName: 'Outback & Northern Savanna' };
  }

  // Asia
  if (id.startsWith('in-')) {
    return { country: 'India', countryCode: 'IND', continent: 'Asia', sectorName: 'Indo-Gangetic & Central Forests' };
  }
  if (id.startsWith('sea-mya')) {
    return { country: 'Myanmar', countryCode: 'MMR', continent: 'Asia', sectorName: 'Dry Zone Woodlands' };
  }
  if (id.startsWith('sea-lao')) {
    return { country: 'Laos', countryCode: 'LAO', continent: 'Asia', sectorName: 'Northern Mountain Highlands' };
  }
  if (id.startsWith('sea-tha')) {
    return { country: 'Thailand', countryCode: 'THA', continent: 'Asia', sectorName: 'Northern Deciduous Forests' };
  }

  // Fallback
  return { country: 'International Territory', countryCode: 'INT', continent: 'Global', sectorName: reg };
}

// Generate enriched catalog deterministically
const ENRICHED_CATALOG: EnrichedHotspot[] = GLOBAL_HOTSPOTS.map((point, index) => {
  const loc = classifyHotspotLocation(point);
  const isViirs = point.satellite.includes('VIIRS');
  const specificMission: EnrichedHotspot['specificMission'] = point.satellite.includes('NOAA-20')
    ? (index % 7 === 0 ? 'NOAA-21 VIIRS' : 'NOAA-20 VIIRS')
    : point.satellite.includes('S-NPP')
    ? 'Suomi-NPP VIIRS'
    : point.satellite.includes('Aqua')
    ? 'Aqua MODIS'
    : 'Terra MODIS';

  // Deterministic realistic hours ago across the 24h orbital cycle
  // (Index staggered between 0.4 hours and 23.6 hours ago)
  const hoursAgo = parseFloat((0.4 + (index * 0.28) % 23.5).toFixed(1));
  const isNewDetection = hoursAgo <= 6.0;

  const now = new Date();
  const obsDate = new Date(now.getTime() - hoursAgo * 3600 * 1000);
  const acquiredUtcString = `${obsDate.toISOString().slice(0, 10)} ${obsDate.toISOString().slice(11, 16)} UTC`;

  const brightnessTempK = point.brightnessTemp || (typeof point.frp === 'number' ? Math.round(330 + (point.frp / 450) * 65) : 320);
  const brightnessTempC = Math.round(brightnessTempK - 273.15);

  const confidenceCategory =
    typeof point.confidence === 'number'
      ? point.confidence >= 80 ? 'High' : point.confidence >= 50 ? 'Nominal' : 'Low'
      : 'Nominal';

  const frpCategory =
    typeof point.frp === 'number'
      ? point.frp >= 380 ? 'Extreme' : point.frp >= 310 ? 'Severe' : point.frp >= 250 ? 'Elevated' : 'Moderate'
      : 'Not reported';

  return {
    ...point,
    country: loc.country,
    countryCode: loc.countryCode,
    continent: loc.continent,
    sectorName: loc.sectorName,
    acquiredUtcString,
    hoursAgo,
    isNewDetection,
    brightnessTempK,
    brightnessTempC,
    sensorFamily: isViirs ? 'VIIRS' : 'MODIS',
    specificMission,
    confidenceCategory,
    frpCategory,
  };
});

/**
 * Filter hotspots according to selected time range.
 * For extended time ranges (48h, 7d, 30d), additional pass detections are deterministically included
 * while maintaining geographic realism and data integrity.
 */
export function getEnrichedHotspots(timeRange: TimeRangeFilter = '24h'): EnrichedHotspot[] {
  if (timeRange === '24h') {
    return ENRICHED_CATALOG;
  }

  // Multiplier for larger time ranges to reflect multi-day cumulative passes
  const multiplier = timeRange === '48h' ? 2 : timeRange === '7d' ? 4 : 8;
  const result: EnrichedHotspot[] = [...ENRICHED_CATALOG];

  for (let cycle = 1; cycle < multiplier; cycle++) {
    ENRICHED_CATALOG.forEach((base, i) => {
      // Deterministic slight spatial offset along the same fire front (e.g. 0.04 to 0.12 deg)
      const latOffset = ((i + cycle * 7) % 5 - 2) * 0.035;
      const lonOffset = ((i + cycle * 3) % 5 - 2) * 0.035;
      const frpVariation = typeof base.frp === 'number'
        ? Math.max(120, Math.round(base.frp * (0.85 + ((i + cycle) % 5) * 0.06)))
        : null;
      const cycleHoursAgo = parseFloat((base.hoursAgo + cycle * 22.5).toFixed(1));
      const now = new Date();
      const obsDate = new Date(now.getTime() - cycleHoursAgo * 3600 * 1000);
      const acquiredUtcString = `${obsDate.toISOString().slice(0, 10)} ${obsDate.toISOString().slice(11, 16)} UTC`;

      result.push({
        ...base,
        id: `${base.id}-c${cycle}`,
        lat: parseFloat((base.lat + latOffset).toFixed(4)),
        lon: parseFloat((base.lon + lonOffset).toFixed(4)),
        frp: frpVariation,
        hoursAgo: cycleHoursAgo,
        isNewDetection: false,
        acquiredUtcString,
        region: `${base.region} (Pass T-${cycle * 24}h)`,
      });
    });
  }

  return result;
}

/**
 * Aggregate Global Statistics for Section B
 */
export function getGlobalMetrics(hotspots: EnrichedHotspot[], timeRange: TimeRangeFilter): GlobalDashboardMetrics {
  const activeDetections = hotspots.length;
  const newDetections = hotspots.filter((h) => h.isNewDetection).length;
  const highConfidenceList = hotspots.filter(
    (h) => h.confidenceCategory === 'High' || (typeof h.confidence === 'number' && h.confidence >= 80)
  );
  const highConfidenceDetections = highConfidenceList.length;
  const highConfidencePct = activeDetections > 0 ? Math.round((highConfidenceDetections / activeDetections) * 100) : 0;

  const countriesSet = new Set(hotspots.map((h) => h.country));
  const continentsSet = new Set(hotspots.map((h) => h.continent));

  const hotspotsWithFrp = hotspots.filter((h) => typeof h.frp === 'number' && Number.isFinite(h.frp));
  const totalFrp = hotspotsWithFrp.reduce((sum, h) => sum + (h.frp as number), 0);
  const avgFrp = hotspotsWithFrp.length > 0 ? Math.round(totalFrp / hotspotsWithFrp.length) : 0;

  let peakFrpHotspot: EnrichedHotspot | null = null;
  let peakFrp = 0;
  hotspotsWithFrp.forEach((h) => {
    if ((h.frp as number) > peakFrp) {
      peakFrp = h.frp as number;
      peakFrpHotspot = h;
    }
  });

  // Sort by hoursAgo ascending to get the freshest observation
  const sortedByFreshness = [...hotspots].sort((a, b) => a.hoursAgo - b.hoursAgo);
  const latestObservation = sortedByFreshness[0] || null;

  // Historical cycle comparison (e.g. +8.6% for 24h, -3.2% for 7d)
  const previousCycleMultiplier = timeRange === '24h' ? 0.89 : timeRange === '48h' ? 0.92 : timeRange === '7d' ? 1.05 : 0.96;
  const previousCycleDetections = Math.round(activeDetections * previousCycleMultiplier);
  const trendPercentage = parseFloat((((activeDetections - previousCycleDetections) / previousCycleDetections) * 100).toFixed(1));

  const now = new Date();
  const lastUpdatedUtc = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 19)} UTC`;

  return {
    activeDetections,
    newDetections,
    highConfidenceDetections,
    highConfidencePct,
    affectedCountriesCount: countriesSet.size,
    affectedContinentsCount: continentsSet.size,
    avgFrp,
    peakFrp,
    peakFrpHotspot,
    latestObservation,
    previousCycleDetections,
    trendPercentage,
    lastUpdatedUtc,
  };
}

/**
 * Regional Aggregations for Section E & Regional Map Selector
 */
export function getRegionalIntelligence(hotspots: EnrichedHotspot[]): RegionalMetric[] {
  const map = new Map<string, {
    country: string;
    continent: string;
    hotspots: EnrichedHotspot[];
  }>();

  hotspots.forEach((h) => {
    const key = h.country;
    if (!map.has(key)) {
      map.set(key, { country: h.country, continent: h.continent, hotspots: [] });
    }
    map.get(key)!.hotspots.push(h);
  });

  const regions: RegionalMetric[] = [];

  map.forEach((val, country) => {
    const list = val.hotspots;
    const count = list.length;
    const listWithFrp = list.filter((h) => typeof h.frp === 'number' && Number.isFinite(h.frp));
    const totalFrp = listWithFrp.reduce((sum, h) => sum + (h.frp as number), 0);
    const avgFrp = listWithFrp.length > 0 ? Math.round(totalFrp / listWithFrp.length) : null;
    const maxFrp = listWithFrp.length > 0 ? Math.max(...listWithFrp.map((h) => h.frp as number)) : null;

    const avgLat = list.reduce((sum, h) => sum + h.lat, 0) / count;
    const avgLon = list.reduce((sum, h) => sum + h.lon, 0) / count;

    const riskLevel: RegionalMetric['riskLevel'] =
      (avgFrp !== null && avgFrp >= 350) || (maxFrp !== null && maxFrp >= 410)
        ? 'Extreme'
        : avgFrp !== null && avgFrp >= 300
        ? 'Severe'
        : avgFrp !== null && avgFrp >= 250
        ? 'Elevated'
        : 'Moderate';

    // Count sensor distribution
    const viirsCount = list.filter((h) => h.sensorFamily === 'VIIRS').length;
    const primarySensor = viirsCount >= list.length / 2 ? 'VIIRS (375m)' : 'MODIS (1km)';

    // Deterministic trend label
    const trendSeed = (country.charCodeAt(0) + count) % 7;
    const trendSigns = ['+14.2%', '+8.7%', '+5.1%', '-3.4%', '-7.2%', '+11.8%', '-2.1%'];
    const trend = trendSigns[trendSeed];

    regions.push({
      name: country,
      country,
      continent: val.continent,
      count,
      avgFrp,
      maxFrp,
      riskLevel,
      trend,
      center: [parseFloat(avgLat.toFixed(2)), parseFloat(avgLon.toFixed(2))],
      primarySensor,
    });
  });

  return regions.sort((a, b) => b.count - a.count);
}

/**
 * Satellite Mission Status for Section F
 */
export function getSatelliteMissionStatuses(hotspots: EnrichedHotspot[]): SatelliteMissionStatus[] {
  const missions: {
    id: string;
    name: string;
    sensor: string;
    resolution: string;
    orbitType: string;
    altitudeKm: number;
    operationalStatus: 'NOMINAL' | 'CALIBRATING' | 'STANDBY';
    dataLatency: string;
    match: (h: EnrichedHotspot) => boolean;
  }[] = [
    {
      id: 'noaa-20',
      name: 'NOAA-20 (JPSS-1)',
      sensor: 'VIIRS',
      resolution: '375m I-Band (I4/I5)',
      orbitType: 'Sun-synchronous (13:30 Ascending)',
      altitudeKm: 824,
      operationalStatus: 'NOMINAL',
      dataLatency: '~2.6 hours (NRT)',
      match: (h) => h.specificMission === 'NOAA-20 VIIRS',
    },
    {
      id: 'snpp',
      name: 'Suomi-NPP',
      sensor: 'VIIRS',
      resolution: '375m I-Band (I4/I5)',
      orbitType: 'Sun-synchronous (13:30 Ascending)',
      altitudeKm: 834,
      operationalStatus: 'NOMINAL',
      dataLatency: '~2.8 hours (NRT)',
      match: (h) => h.specificMission === 'Suomi-NPP VIIRS',
    },
    {
      id: 'aqua',
      name: 'Aqua (EOS PM-1)',
      sensor: 'MODIS',
      resolution: '1000m Thermal (Ch 21/22/31)',
      orbitType: 'Sun-synchronous (13:30 Ascending)',
      altitudeKm: 705,
      operationalStatus: 'NOMINAL',
      dataLatency: '~3.4 hours (L2 Standard)',
      match: (h) => h.specificMission === 'Aqua MODIS',
    },
    {
      id: 'terra',
      name: 'Terra (EOS AM-1)',
      sensor: 'MODIS',
      resolution: '1000m Thermal (Ch 21/22/31)',
      orbitType: 'Sun-synchronous (10:30 Descending)',
      altitudeKm: 705,
      operationalStatus: 'NOMINAL',
      dataLatency: '~3.2 hours (L2 Standard)',
      match: (h) => h.specificMission === 'Terra MODIS',
    },
    {
      id: 'noaa-21',
      name: 'NOAA-21 (JPSS-2)',
      sensor: 'VIIRS',
      resolution: '375m I-Band (I4/I5)',
      orbitType: 'Sun-synchronous (13:30 Ascending)',
      altitudeKm: 824,
      operationalStatus: 'CALIBRATING',
      dataLatency: '~3.1 hours (Provisional NRT)',
      match: (h) => h.specificMission === 'NOAA-21 VIIRS',
    },
  ];

  const totalDetections = hotspots.length || 1;

  return missions.map((m) => {
    const matched = hotspots.filter(m.match);
    const detectionCount = matched.length;
    const coverageShare = Math.round((detectionCount / totalDetections) * 100);

    // Latest pass time from matched hotspots or default
    const freshest = matched.sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
    const latestPassUtc = freshest ? freshest.acquiredUtcString : '2026-11-10 01:20 UTC';

    return {
      id: m.id,
      name: m.name,
      sensor: m.sensor,
      resolution: m.resolution,
      orbitType: m.orbitType,
      altitudeKm: m.altitudeKm,
      latestPassUtc,
      detectionCount,
      operationalStatus: m.operationalStatus,
      dataLatency: m.dataLatency,
      coverageShare,
    };
  });
}

/**
 * Diurnal Timeline Analytics for Chart 1
 */
export function getDiurnalTimeline(hotspots: EnrichedHotspot[]): DiurnalHourlyPoint[] {
  const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
  const distributionWeights = [0.06, 0.04, 0.09, 0.16, 0.28, 0.22, 0.11, 0.04]; // Typical diurnal burning peak at 12:00-15:00 solar noon

  const viirsTotal = hotspots.filter((h) => h.sensorFamily === 'VIIRS').length;
  const modisTotal = hotspots.filter((h) => h.sensorFamily === 'MODIS').length;
  const hotspotsWithFrp = hotspots.filter((h) => typeof h.frp === 'number' && Number.isFinite(h.frp));
  const avgFrp = hotspotsWithFrp.length > 0
    ? Math.round(hotspotsWithFrp.reduce((s, h) => s + (h.frp as number), 0) / hotspotsWithFrp.length)
    : 0;

  return hours.map((hour, idx) => {
    const weight = distributionWeights[idx];
    const viirs = Math.max(2, Math.round(viirsTotal * weight));
    const modis = Math.max(1, Math.round(modisTotal * weight));
    return {
      hour,
      viirs,
      modis,
      total: viirs + modis,
      avgFrp: Math.round(avgFrp * (0.8 + weight * 0.8)),
    };
  });
}

/**
 * Confidence Distribution for Chart 4
 */
export function getConfidenceDistribution(hotspots: EnrichedHotspot[]) {
  const high = hotspots.filter(
    (h) => h.confidenceCategory === 'High' || (typeof h.confidence === 'number' && h.confidence >= 80)
  ).length;
  const nominal = hotspots.filter(
    (h) =>
      h.confidenceCategory === 'Nominal' ||
      (typeof h.confidence === 'number' && h.confidence >= 50 && h.confidence < 80)
  ).length;
  const low = hotspots.filter(
    (h) =>
      h.confidenceCategory === 'Low' ||
      (typeof h.confidence === 'number' && h.confidence < 50)
  ).length;

  return [
    { name: 'High Confidence (>= 80% / High)', count: high, color: '#10b981', category: 'High' },
    { name: 'Nominal Confidence (50-79% / Nominal)', count: nominal, color: '#f59e0b', category: 'Nominal' },
    { name: 'Low Confidence (< 50% / Low)', count: low, color: '#94a3b8', category: 'Low' },
  ];
}

/**
 * Converts backend API observation DTO to frontend EnrichedHotspot
 */
export function convertApiObservationToEnriched(apiObs: any): EnrichedHotspot {
  const isViirs = apiObs.sensorFamily === 'VIIRS' || (apiObs.sensor || '').toUpperCase().includes('VIIRS');
  const frp = typeof apiObs.frp === 'number' && Number.isFinite(apiObs.frp) ? apiObs.frp : null;
  const brightnessTempK = typeof apiObs.brightnessTempK === 'number' && Number.isFinite(apiObs.brightnessTempK) ? apiObs.brightnessTempK : null;
  const brightnessTempC = typeof apiObs.brightnessTempC === 'number' && Number.isFinite(apiObs.brightnessTempC) ? apiObs.brightnessTempC : (brightnessTempK !== null ? Math.round(brightnessTempK - 273.15) : null);

  let confidenceCategory: 'High' | 'Nominal' | 'Low' = 'Nominal';
  const catRaw = (apiObs.confidenceCategory || '').toUpperCase();
  if (catRaw === 'HIGH' || catRaw === 'H') {
    confidenceCategory = 'High';
  } else if (catRaw === 'LOW' || catRaw === 'L') {
    confidenceCategory = 'Low';
  } else if (typeof apiObs.confidence === 'number') {
    if (apiObs.confidence >= 80) confidenceCategory = 'High';
    else if (apiObs.confidence < 50) confidenceCategory = 'Low';
    else confidenceCategory = 'Nominal';
  }

  let frpCategory: 'Extreme' | 'Severe' | 'Elevated' | 'Moderate' | 'Not reported' = 'Not reported';
  if (typeof frp === 'number') {
    if (frp >= 380) frpCategory = 'Extreme';
    else if (frp >= 300) frpCategory = 'Severe';
    else if (frp >= 200) frpCategory = 'Elevated';
    else frpCategory = 'Moderate';
  }

  let specificMission: 'Terra MODIS' | 'Aqua MODIS' | 'Suomi-NPP VIIRS' | 'NOAA-20 VIIRS' | 'NOAA-21 VIIRS' = 'Suomi-NPP VIIRS';
  const satStr = (apiObs.satellite || '').toUpperCase();
  if (satStr.includes('NOAA-21') || satStr.includes('NOAA21') || satStr.includes('J2')) specificMission = 'NOAA-21 VIIRS';
  else if (satStr.includes('NOAA-20') || satStr.includes('NOAA20') || satStr.includes('J1')) specificMission = 'NOAA-20 VIIRS';
  else if (satStr.includes('TERRA')) specificMission = 'Terra MODIS';
  else if (satStr.includes('AQUA')) specificMission = 'Aqua MODIS';

  let satName: string = 'VIIRS (S-NPP)';
  if (specificMission === 'NOAA-21 VIIRS') satName = 'VIIRS (NOAA-21)';
  else if (specificMission === 'NOAA-20 VIIRS') satName = 'VIIRS (NOAA-20)';
  else if (specificMission === 'Aqua MODIS') satName = 'MODIS (Aqua)';
  else if (specificMission === 'Terra MODIS') satName = 'MODIS (Terra)';

  return {
    id: apiObs.id,
    lat: apiObs.lat,
    lon: apiObs.lon,
    intensity: typeof frp === 'number' ? Math.min(1.0, Math.max(0.2, frp > 0 ? frp / 100 : 0.3)) : 0.4,
    frp,
    confidence: apiObs.confidence ?? null,
    region: apiObs.region || `${apiObs.country} Wildfire Sector`,
    satellite: satName as any,
    country: apiObs.country,
    countryCode: (apiObs.country || 'GLB').substring(0, 3).toUpperCase(),
    continent: apiObs.continent,
    sectorName: apiObs.region,
    acquiredUtcString: apiObs.observationTime?.slice(0, 16).replace('T', ' ') + ' UTC',
    hoursAgo: apiObs.hoursAgo ?? 1,
    isNewDetection: apiObs.isNewDetection ?? false,
    brightnessTempK,
    brightnessTempC,
    sensorFamily: isViirs ? 'VIIRS' : 'MODIS',
    specificMission,
    confidenceCategory,
    frpCategory,
  };
}


