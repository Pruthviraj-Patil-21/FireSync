import { GLOBAL_HOTSPOTS, HotspotPoint } from '../components/earth/fireData';

const API_BASE = '/api/v1';

export interface ApiObservation {
  id: string;
  lat: number;
  lon: number;
  frp: number | null;
  confidence: number | null;
  confidenceRaw?: string | null;
  confidenceCategory?: 'LOW' | 'NOMINAL' | 'HIGH' | null;
  brightnessTempK: number | null;
  brightnessTempC: number | null;
  satellite: string;
  satelliteCode?: string | null;
  sensor: string;
  sensorFamily: 'VIIRS' | 'MODIS';
  dayNight: string;
  scanResolution: string;
  version?: string | null;
  sourceDataset: string;
  observationTime: string;
  acquisitionDate: string;
  ingestedAt?: string | null;
  country: string;
  continent: string;
  region: string;
  incidentId: string | null;
  incidentName: string | null;
  biomassCombustionRateKgS: number | null;
  isNewDetection: boolean;
  hoursAgo: number;
}

export interface ApiPaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  timestamp: string;
}

export interface ApiOverviewMetrics {
  activeDetections: number;
  newDetections: number;
  highConfidenceDetections: number;
  highConfidencePct: number;
  affectedCountriesCount: number;
  affectedContinentsCount: number;
  avgFrp: number;
  peakFrp: number;
  peakFrpHotspot: ApiObservation | null;
  latestObservation: ApiObservation | null;
  previousCycleDetections: number;
  trendPercentage: number;
  lastUpdatedUtc: string;
}

export interface ApiSatelliteMission {
  id: string;
  missionCode: string;
  name: string;
  satellitePlatform: string;
  sensor: string;
  description: string;
  orbitType: string;
  altitudeKm: number;
  inclinationDeg: number;
  spatialResolution: string;
  spectralBands: string;
  swathWidthKm: number | null;
  overpassTime: string | null;
  status: string;
  dataSource: string;
  latestPassUtc: string | null;
  detectionCount: number;
  operationalStatus: 'NOMINAL' | 'CALIBRATING' | 'STANDBY';
  dataLatency: string;
  coverageShare: number;
}

export interface ApiFireIncident {
  id: string;
  name: string;
  centroidLat: number;
  centroidLon: number;
  firstObservedAt: string;
  lastObservedAt: string;
  status: string;
  observationCount: number;
  peakFrp: number;
  totalFrp: number;
  region: string | null;
}

export interface ApiWeather {
  latitude: number;
  longitude: number;
  temperatureC: number;
  humidityPct: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  precipitationMm: number;
  airQualityIndex: number | null;
  observationTime: string;
  dataSource: string;
}

export interface UserAuthData {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
  token: string;
}

export interface ApiHarmonizationRun {
  id: string;
  regionName: string;
  minLat: number | null;
  maxLat: number | null;
  minLon: number | null;
  maxLon: number | null;
  startDate: string | null;
  endDate: string | null;
  gridResolutionM: number;
  spatialCrs: string;
  spatialDistanceM: number;
  timeWindowMinutes: number;
  status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalInputObservations: number;
  validModisCount: number;
  validViirsCount: number;
  rejectedCount: number;
  candidateMatchCount: number;
  modisOnlyCount: number;
  viirsOnlyCount: number;
  uniqueGridCells: number;
  scientificNotes: Record<string, string> | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ApiHarmonizedMatch {
  id: string;
  runId: string;
  matchKey: string;
  matchClass: 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY';
  modisObservationId: string | null;
  viirsObservationId: string | null;
  gridCellId: string;
  spatialCrs: string;
  gridResolutionM: number;
  distanceM: number | null;
  timeDiffMinutes: number | null;
  matchScore: number | null;
  acqDate: string;
  modisObservation?: {
    id: string;
    latitude: number;
    longitude: number;
    satellitePlatform: string;
    observationTime: string;
    frp: number | null;
    brightnessTemp: number | null;
    confidence: number | null;
    confidenceRaw: string | null;
    confidenceCategory: string | null;
    sourceDataset: string;
  } | null;
  viirsObservation?: {
    id: string;
    latitude: number;
    longitude: number;
    satellitePlatform: string;
    observationTime: string;
    frp: number | null;
    brightnessTemp: number | null;
    confidence: number | null;
    confidenceRaw: string | null;
    confidenceCategory: string | null;
    sourceDataset: string;
  } | null;
}

export interface ApiHarmonizedDailySummary {
  id: string;
  runId: string;
  date: string;
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
  estimatedBurnedAreaHa: number | null;
  provenanceAndNotes: Record<string, unknown> | null;
}

class ApiClient {
  private token: string | null = null;
  private backendLive = true;

  constructor() {
    this.token = typeof window !== 'undefined' ? localStorage.getItem('firesync_token') : null;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('firesync_token', token);
      else localStorage.removeItem('firesync_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public isLive(): boolean {
    return this.backendLive;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      this.backendLive = true;
      return json.data;
    } catch (err) {
      this.backendLive = false;
      throw err;
    }
  }

  private async requestFull<T>(path: string, options: RequestInit = {}): Promise<{ data: T; meta?: any }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      this.backendLive = true;
      return { data: json.data, meta: json.meta };
    } catch (err) {
      this.backendLive = false;
      throw err;
    }
  }

  // Dashboard Overview
  public async getDashboardOverview(): Promise<ApiOverviewMetrics> {
    return await this.request<ApiOverviewMetrics>('/dashboard/overview');
  }

  // Fires Paginated Query
  public async getFiresPaginated(params?: {
    limit?: number;
    offset?: number;
    minLat?: number;
    maxLat?: number;
    minLon?: number;
    maxLon?: number;
    confidence?: number;
    confidenceCategory?: string;
    minFrp?: number;
    sensor?: string;
    satellite?: string;
    dayNight?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    timeRange?: string;
  }): Promise<ApiPaginatedResponse<ApiObservation>> {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.minLat !== undefined) qs.set('minLat', String(params.minLat));
    if (params?.maxLat !== undefined) qs.set('maxLat', String(params.maxLat));
    if (params?.minLon !== undefined) qs.set('minLon', String(params.minLon));
    if (params?.maxLon !== undefined) qs.set('maxLon', String(params.maxLon));
    if (params?.confidence !== undefined) qs.set('confidence', String(params.confidence));
    if (params?.confidenceCategory) qs.set('confidenceCategory', params.confidenceCategory);
    if (params?.minFrp !== undefined) qs.set('minFrp', String(params.minFrp));
    if (params?.sensor) qs.set('sensor', params.sensor);
    if (params?.satellite) qs.set('satellite', params.satellite);
    if (params?.dayNight) qs.set('dayNight', params.dayNight);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortOrder) qs.set('sortOrder', params.sortOrder);
    if (params?.timeRange) qs.set('timeRange', params.timeRange);

    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    const res = await this.requestFull<ApiObservation[]>(`/fires${queryStr}`);
    return {
      items: res.data || [],
      total: res.meta?.total ?? (res.data ? res.data.length : 0),
      limit: res.meta?.limit ?? (params?.limit || 500),
      offset: res.meta?.offset ?? (params?.offset || 0),
      timestamp: res.meta?.timestamp ?? new Date().toISOString()
    };
  }

  // Fires Batch or All Query
  public async getFires(params?: {
    limit?: number;
    offset?: number;
    minLat?: number;
    maxLat?: number;
    minLon?: number;
    maxLon?: number;
    confidence?: number;
    confidenceCategory?: string;
    minFrp?: number;
    sensor?: string;
    satellite?: string;
    dayNight?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    timeRange?: string;
    fetchAll?: boolean;
  }): Promise<ApiObservation[]> {
    if (params?.fetchAll) {
      const pageSize = 5000;
      let offset = 0;
      let allItems: ApiObservation[] = [];
      let total = Infinity;

      while (allItems.length < total) {
        const page = await this.getFiresPaginated({
          ...params,
          limit: pageSize,
          offset
        });
        total = page.total;
        if (!page.items || page.items.length === 0) break;
        allItems = allItems.concat(page.items);
        offset += page.items.length;
        if (offset >= total) break;
      }
      return allItems;
    }

    const res = await this.getFiresPaginated(params);
    return res.items;
  }

  // Incidents
  public async getIncidents(): Promise<ApiFireIncident[]> {
    try {
      return await this.request<ApiFireIncident[]>('/incidents');
    } catch {
      return [];
    }
  }

  // Satellites
  public async getSatellites(): Promise<ApiSatelliteMission[]> {
    try {
      return await this.request<ApiSatelliteMission[]>('/satellites');
    } catch {
      return [];
    }
  }

  // Weather Nearby
  public async getWeatherNearby(lat: number, lon: number): Promise<ApiWeather> {
    try {
      return await this.request<ApiWeather>(`/weather/nearby?lat=${lat}&lon=${lon}`);
    } catch {
      return {
        latitude: lat,
        longitude: lon,
        temperatureC: 32.5,
        humidityPct: 24,
        windSpeedKmh: 25.2,
        windDirectionDeg: 210,
        precipitationMm: 0,
        airQualityIndex: 155,
        observationTime: new Date().toISOString(),
        dataSource: 'Local Fallback'
      };
    }
  }

  // System Health
  public async getHealth() {
    return this.request<{ status: string; database: { connected: boolean } }>('/system/health');
  }

  // Auth Login
  public async login(email: string, password: string): Promise<UserAuthData> {
    const data = await this.request<UserAuthData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
    return data;
  }

  // Current User
  public async getMe() {
    return this.request<any>('/auth/me');
  }

  // Harmonization API (/api/harmonization/*)
  private async requestHarmonization<T>(path: string, options: RequestInit = {}): Promise<{ data: T; meta?: any }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`/api/harmonization${path}`, {
      ...options,
      headers
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(json?.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    this.backendLive = true;
    return { data: json.data, meta: json.meta };
  }

  public async runHarmonization(params: {
    regionName?: string;
    minLat?: number;
    maxLat?: number;
    minLon?: number;
    maxLon?: number;
    startDate?: string;
    endDate?: string;
    spatialDistanceM?: number;
    timeWindowMinutes?: number;
    gridResolutionM?: number;
  }) {
    const res = await this.requestHarmonization<{
      run: ApiHarmonizationRun;
      summary: Record<string, number>;
      dailySummaries: ApiHarmonizedDailySummary[];
      scientificNotes: Record<string, string>;
    }>('/run', {
      method: 'POST',
      body: JSON.stringify(params)
    });
    return res.data;
  }

  public async getHarmonizationStatus() {
    const res = await this.requestHarmonization<{
      latestRun: ApiHarmonizationRun | null;
      recentRuns: ApiHarmonizationRun[];
    }>('/status');
    return res.data;
  }

  public async getHarmonizationResults(params?: {
    runId?: string;
    matchClass?: 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY';
    limit?: number;
    offset?: number;
  }) {
    const qs = new URLSearchParams();
    if (params?.runId) qs.set('runId', params.runId);
    if (params?.matchClass) qs.set('matchClass', params.matchClass);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';

    const res = await this.requestHarmonization<{
      run: ApiHarmonizationRun | null;
      items: ApiHarmonizedMatch[];
    }>(`/results${queryStr}`);
    return { ...res.data, total: res.meta?.total ?? res.data.items.length };
  }

  public async getHarmonizationDaily(params?: { runId?: string; startDate?: string; endDate?: string }) {
    const qs = new URLSearchParams();
    if (params?.runId) qs.set('runId', params.runId);
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';

    const res = await this.requestHarmonization<{
      run: ApiHarmonizationRun | null;
      daily: ApiHarmonizedDailySummary[];
    }>(`/daily${queryStr}`);
    return res.data;
  }

  public getHarmonizationExportUrl(params?: {
    runId?: string;
    format?: 'csv' | 'geojson';
    type?: 'matches' | 'daily';
    matchClass?: 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY';
  }): string {
    const qs = new URLSearchParams();
    if (params?.runId) qs.set('runId', params.runId);
    if (params?.format) qs.set('format', params.format);
    if (params?.type) qs.set('type', params.type);
    if (params?.matchClass) qs.set('matchClass', params.matchClass);
    return `/api/harmonization/export?${qs.toString()}`;
  }

  public downloadHarmonizationExport(params?: {
    runId?: string;
    format?: 'csv' | 'geojson';
    type?: 'matches' | 'daily';
    matchClass?: 'CANDIDATE_MATCH' | 'MODIS_ONLY' | 'VIIRS_ONLY';
  }): void {
    const url = this.getHarmonizationExportUrl(params);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const apiClient = new ApiClient();

