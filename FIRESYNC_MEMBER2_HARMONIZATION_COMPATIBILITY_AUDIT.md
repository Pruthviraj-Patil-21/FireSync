# FIRESYNC_MEMBER2_HARMONIZATION_COMPATIBILITY_AUDIT.md

**Audit Type:** Strictly Read-Only Compatibility & Integration Audit  
**Target Project (Member 2):** `c:\Users\PRUTHVIRAJ\Documents\nasa-project\FireSync`  
**Reference Project (Member 1):** `C:\Users\PRUTHVIRAJ\Documents\FireSync\scientific-service`  
**Epistemic Labels Used:** `[Verified in source]` | `[Inferred from source]` | `[Not verified]` | `[Missing]`

---

## 1. Project and Git Status

- **Target Directory:** `c:\Users\PRUTHVIRAJ\Documents\nasa-project\FireSync` `[Verified in source]`
- **Current Git Branch:** `firesync-development` `[Verified in source via git branch --show-current]`
- **Working Tree Status:** `[Verified in source via git status --short]`
  - **Modified (unstaged):** `.env.example`, `backend/.env.example`, `backend/prisma/schema.prisma`, `backend/src/config/env.ts`, `backend/src/controllers/fireController.ts`, `backend/src/services/fireService.ts`, `backend/src/services/firmsIngestionService.ts`, `backend/src/services/firmsIngestionService.test.ts`, `backend/src/types/index.ts`
  - **Untracked:** `backend/prisma/migrations/`, `FIRESYNC_CURRENT_PROJECT_COMPLETE_ANALYSIS.md`, `STAGE_1_FIRMS_INGESTION_REPORT.md`, `STAGE_1_VALIDATION_REPORT.md`
  - **Previously Staged (from prior cleanup):** `.gitignore`, root `package.json`, `package-lock.json`, `start-*.bat`, `backend/src/index.ts`, `backend/src/api.test.ts`, `backend/package-lock.json`, `frontend/.env.example`, and `--cached` removals of `node_modules/`, `dist/`, `backend/.env`.
- **Directory Structure:** `[Verified in source]`
  - `frontend/` — React 18 + TypeScript + Vite SPA (`src/pages/`, `src/components/`, `src/services/`)
  - `backend/` — Node.js + Express + TypeScript + Prisma API (`src/config/`, `src/controllers/`, `src/db/`, `src/jobs/`, `src/middleware/`, `src/routes/`, `src/services/`, `src/types/`, `prisma/`)
  - **Existing Python Service Directory in Member 2:** `[Missing]` — None exists in `nasa-project\FireSync`. Root `.env` and `.env.example` contain unused `FASTAPI_PORT=8000`, `FASTAPI_HOST=127.0.0.1`, `FASTAPI_SERVICE_URL=http://127.0.0.1:8000`, `FASTAPI_TIMEOUT_MS=8000` placeholders `[Verified in source]`.

---

## 2. Existing Architecture

- **Frontend (`frontend/`):** React `18.3.1`, TypeScript `5.6.3`, Vite `5.4.10` (dev proxy `/api` → `http://localhost:5000` in `vite.config.ts`), Tailwind CSS `3.4.14`, Three.js / `@react-three/fiber`, `react-leaflet` `4.2.1`, Recharts `2.13.0`, Framer Motion `11.11.10`. `[Verified in source]`
- **Backend (`backend/`):** Express `4.21.2`, TypeScript `5.7.2`, Prisma `5.22.0`, PostgreSQL (`pg` `8.13.1`), Zod `3.24.1`, Axios `1.7.9`, `node-cron` `3.0.3`, Winston `3.17.0`, Swagger UI at `/api/docs`. `[Verified in source]`
- **Existing API Routes (`backend/src/routes/index.ts` mounted at `/api/v1`):** `[Verified in source]`
  - `/auth` (`authRoutes.ts`: `POST /register`, `POST /login`, `POST /logout`, `GET /me`)
  - `/dashboard` (`dashboardRoutes.ts`: `GET /overview`, `/statistics`, `/trends`, `/regional-activity`, `/sensor-comparison`)
  - `/fires` (`fireRoutes.ts`: `GET /`, `/statistics`, `/regions`, `/nearby`, `/:id`)
  - `/incidents` (`incidentRoutes.ts`: `GET /`, `/:id`, `/:id/observations`)
  - `/satellites` (`satelliteRoutes.ts`: `GET /`, `/imagery`, `/:code`)
  - `/history` (`historyRoutes.ts`: `GET /statistics`)
  - `/weather` (`weatherRoutes.ts`: `GET /nearby`)
  - `/users` (`userRoutes.ts`: `/saved-locations`, `/alerts` — protected by `authenticate, requireAuth`)
  - `/system` (`systemRoutes.ts`: `GET /health`, `/data-sources`, `/ingestion-status`, `POST /trigger-ingestion`)
- **Existing Harmonization API in Member 2:** `[Missing]` — No routes, controllers, or services exist for triggering harmonization, retrieving harmonization runs/status, matched pairs, `MODIS_ONLY`/`VIIRS_ONLY` sets, or daily common-grid summaries.

---

## 3. Complete Prisma Schema Inventory (`backend/prisma/schema.prisma`)

All 10 models `[Verified in source]`:

| Model (`@@map`) | Key Fields & Types | Relations | Indexes / Unique Constraints |
| :--- | :--- | :--- | :--- |
| **`User`** (`users`) | `id` (`String` UUID PK), `email` (`String`), `passwordHash` (`String`), `fullName` (`String`), `role` (`UserRole`), `status` (`AccountStatus`), `createdAt`, `updatedAt` | `savedLocations` (`SavedLocation[]`), `alertRules` (`AlertRule[]`) | `@unique` on `email` |
| **`FireIncident`** (`fire_incidents`) | `id` (UUID PK), `name`, `latitude` (`Float`), `longitude` (`Float`), `firstObservedAt`, `lastObservedAt`, `status` (`FireStatus`), `observationCount` (`Int`), `peakFrp` (`Float?`), `totalFrp` (`Float?`), `estimatedPerimeter` (`Json?`), `region` (`String?`), `metadata` (`Json?`), `createdAt`, `updatedAt` | `observations` (`FireObservation[]`) | `@@index([latitude, longitude])`, `@@index([status])`, `@@index([firstObservedAt, lastObservedAt])` |
| **`FireObservation`** (`fire_observations`) | `id` (UUID PK), `latitude` (`Float`), `longitude` (`Float`), `observationTime` (`DateTime`), `acquisitionDate` (`DateTime`), `satellitePlatform` (`String`), `satelliteCode` (`String?`), `sensor` (`String`), `confidence` (`Float?`), `confidenceRaw` (`String?`), `confidenceCategory` (`String?`), `brightnessTemp` (`Float?`), `brightnessTemp31` (`Float?`), `frp` (`Float?`), `scan` (`Float?`), `track` (`Float?`), `dayNight` (`String?`), `version` (`String?`), `sourceDataset` (`String`), `sourceId` (`String?`), `incidentId` (`String?`), `ingestedAt` (`DateTime`), `metadata` (`Json?`) | `incident` (`FireIncident?` via `incidentId`, `onDelete: SetNull`) | `@unique` on `sourceId`; `@@index([latitude, longitude])`, `@@index([observationTime])`, `@@index([confidence])`, `@@index([confidenceCategory])`, `@@index([frp])`, `@@index([satellitePlatform])`, `@@index([sensor])`, `@@index([sensor, observationTime])` |
| **`SatelliteMission`** (`satellite_missions`) | `id` (UUID PK), `missionCode`, `name`, `satellitePlatform`, `sensor`, `description`, `orbitType`, `altitudeKm`, `inclinationDeg`, `spatialResolution`, `spectralBands`, `swathWidthKm` (`Float?`), `overpassTime` (`String?`), `status`, `dataSource`, `lastObservationTime` (`DateTime?`), `operationalMetadata` (`Json?`) | None | `@unique` on `missionCode` |
| **`SatelliteImageryMetadata`** (`satellite_imagery_metadata`) | `id` (UUID PK), `layerId`, `title`, `sensor`, `dataset`, `acquisitionDate`, `imageryType`, `resolution`, `format`, `tileMatrixSet`, `wmtsTemplate`, `wmsUrl`, `attribution`, `processingInfo`, `isAvailable`, `boundingBox` (`Json?`) | None | `@@index([layerId])`, `@@index([sensor, acquisitionDate])` |
| **`HistoricalFireStatistics`** (`historical_fire_statistics`) | `id` (UUID PK), `region`, `periodType`, `startDate`, `endDate`, `observationCount`, `averageFrp` (`Float?`), `peakFrp` (`Float?`), `source` | None | `@@index([region, periodType])`, `@@index([startDate, endDate])` |
| **`WeatherObservation`** (`weather_observations`) | `id` (UUID PK), `latitude`, `longitude`, `temperature`, `humidity`, `windSpeed`, `windDirection`, `precipitation`, `airQualityIndex`, `observationTime`, `dataSource`, `recordedAt` | None | `@@index([latitude, longitude])`, `@@index([observationTime])` |
| **`SavedLocation`** (`saved_locations`) | `id` (UUID PK), `userId`, `name`, `latitude`, `longitude`, `radiusKm` | `user` (`User`, `onDelete: Cascade`) | `@@index([userId])` |
| **`AlertRule`** (`alert_rules`) | `id` (UUID PK), `userId`, `name`, `latitude`, `longitude`, `radiusKm`, `alertType`, `threshold`, `enabled`, `lastTriggeredAt` | `user` (`User`, `onDelete: Cascade`) | `@@index([userId])` |
| **`DataIngestionLog`** (`data_ingestion_logs`) | `id` (UUID PK), `source`, `jobId`, `startTime`, `endTime`, `recordsReceived`, `recordsInserted`, `recordsUpdated`, `recordsFailed`, `status` (`IngestionStatus`), `errorMessage`, `metadata` (`Json?`) | None | `@@index([source, startTime])`, `@@index([status])` |

**Note on DB & Migration State:** `backend/prisma/migrations/20261112000000_firms_ingestion_fields/migration.sql` has not yet been applied to a live PostgreSQL instance (local `localhost:5432` was unreachable in Stage 1 validation). `[Verified in source]`

---

## 4. `FireObservation` → Python Input Field Mapping Table

| Scientific Input | Member 2 `FireObservation` Field (`schema.prisma`) | Member 1 Python Input Key (`schemas.py` / `standardizer.py`) | Mapping / Transformation & Mismatch Notes |
| :--- | :--- | :--- | :--- |
| **Observation ID** | `id` (`String` UUID) | `id` (`Optional[str]`) → preserved as `observation_id` | Direct 1:1 string mapping `[Verified in source]`. |
| **Latitude** | `latitude` (`Float`) | `latitude` (`float`) | Direct mapping `[Verified in source]`. |
| **Longitude** | `longitude` (`Float`) | `longitude` (`float`) | Direct mapping `[Verified in source]`. |
| **Sensor** | `sensor` (`String`: `'MODIS'` / `'VIIRS'`) | `sensor` (`str`) | Direct mapping `[Verified in source]`. |
| **Satellite** | `satellitePlatform` (`String`) | `satellite` (`str`) | Maps `'Terra'`, `'Aqua'`, `'Suomi-NPP'`, `'NOAA-20'`, `'NOAA-21'`. **Edge case:** if `'Unknown MODIS'`, `standardizer.normalize_satellite_name` preserves `'Unknown MODIS'` `[Verified in source]`. |
| **Acquisition Timestamp** | `observationTime` (`DateTime` UTC) | `acq_timestamp` (`str` ISO UTC) | **Critical mismatch risk:** `standardizer.py:201` evaluates `r.get("acq_date") or r.get("date") or r.get("acq_timestamp")`. If `acq_date` is sent as ISO midnight (`2026-04-10T00:00:00.000Z`), `parse_utc_timestamp` parses `acq_date` and **ignores `acq_time`**, losing time-of-day! Adapter must send `acq_timestamp: obs.observationTime.toISOString()` and omit `acq_date` (or send `acq_date: "YYYY-MM-DD"` + `acq_time: "HHMM"`). `[Verified in source]` |
| **Acquisition Date / Time** | `acquisitionDate` (`DateTime`), `observationTime` (`DateTime`) | `acq_date`, `acq_time` | Stored as `DateTime` in Prisma; extract UTC `YYYY-MM-DD` and `HHMM` if passing separately `[Verified in source]`. |
| **FRP** | `frp` (`Float?`, MW) | `frp` / `frp_mw` (`float`, MW) | Direct mapping; **caveat:** `standardizer.py:233` coerces `None` to `0.0` `[Verified in source]`. |
| **Brightness Temp** | `brightnessTemp` (`Float?`, Kelvin), `brightnessTemp31` (`Float?`, Kelvin) | `brightness_kelvin` (`float`, Kelvin) | Map `obs.brightnessTemp`; **caveat:** `standardizer.py:224` coerces `None` to `300.0` K; `brightnessTemp31` is not retained separately by `standardizer.py` unless in `raw_metadata` `[Verified in source]`. |
| **Confidence** | `confidence` (`Float?` MODIS 0–100, `null` VIIRS), `confidenceRaw` (`String?`), `confidenceCategory` (`String?`) | `confidence_raw` / `confidence` | Pass `obs.confidenceRaw ?? (obs.confidence !== null ? String(obs.confidence) : null)`. **Caveat:** if `None`, `standardizer.py:98` defaults category to `"NOMINAL"` and `estimated_internal_score` to `50` `[Verified in source]`. |
| **Day/Night** | `dayNight` (`String?`: `'Day'`, `'Night'`, `'D'`, `'N'`) | `daynight` (`str`: `'D'` / `'N'`) | `standardizer.py:253` truncates to 1 uppercase char (`'Day'` → `'D'`, `'Night'` → `'N'`) `[Verified in source]`. |
| **Pixel Footprint** | `scan` (`Float?`, km), `track` (`Float?`, km) | `scan`, `track` (`float`, km) | Direct mapping; if `null`, `standardizer.py:241` defaults to `1.0` (MODIS) / `0.375` (VIIRS) `[Verified in source]`. |
| **Raw Metadata** | `sourceDataset`, `sourceId`, `satelliteCode`, `version`, `metadata` (`Json?`) | `product`, `version`, `raw_metadata` | Map `sourceDataset` → `product`, `version` → `version`, and pack `{ sourceId, satelliteCode, ...metadata }` into `raw_metadata` `[Verified in source]`. |
| **Country** | **[Missing on model]** | `country_code` (`Optional[str]`, default `"IND"`) | **Schema Mismatch:** `FireObservation` has no `country` / `countryCode` column! `FireService.classifyLocation()` in `fireService.ts` computes coarse bounding boxes at query time (and omits Northeast India `lon > 90`) `[Verified in source]`. |

---

## 5. FIRMS Ingestion Compatibility (`backend/src/services/firmsIngestionService.ts`)

Inspected `firmsIngestionService.ts`, `jobs/scheduler.ts`, and `config/env.ts` `[Verified in source]`:
- **Compatible & Preserved:**
  - Queries official FIRMS endpoints (`/api/country/csv/...` and `/api/area/csv/...`) for `MODIS_NRT`, `MODIS_SP`, `VIIRS_SNPP_NRT`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_NRT`, defaulting to India (`IND` / `68.0,6.5,97.5,37.5`).
  - Parses `acq_date` + `acq_time` into strict UTC `observationTime` and `acquisitionDate` (`parseFirmsAcquisitionTimestamp`), rejecting invalid rows rather than using `new Date()`.
  - Maps spacecraft accurately (`Terra`, `Aqua`, `Suomi-NPP`, `NOAA-20`, `NOAA-21`) and retains `satelliteCode`.
  - Preserves `confidenceRaw` (`'l'`, `'n'`, `'h'`, numeric) and `confidenceCategory`, keeping `confidence` `null` for VIIRS categorical values.
  - Preserves `brightnessTemp` (`bright_ti4`/`brightness`), `brightnessTemp31` (`bright_ti5`/`bright_t31`), `frp`, `scan`, `track`, `dayNight`, `version`, `sourceDataset`, deterministic `sourceId`, and `metadata`.
  - Uses 100-row `$transaction` upserts, logs to `data_ingestion_logs`, and never injects mock observations when `NASA_FIRMS_MAP_KEY` is missing.
- **Minor Gap for Integration:**
  - `FireObservation` does not store `countryCode` (or `region`) directly on the row; Member 2's adapter must filter by bounding box (`minLat`, `maxLat`, `minLon`, `maxLon`) or supply `country_code` explicitly.
  - Live FIRMS API + PostgreSQL persistence is `[Not verified]` until PostgreSQL is running and `NASA_FIRMS_MAP_KEY` is configured.

---

## 6. Member 1 Python API Contract (`C:\Users\PRUTHVIRAJ\Documents\FireSync\scientific-service`)

Verified directly in `app/api/harmonize.py`, `app/models/schemas.py`, `app/services/harmonizer_engine.py`, `standardizer.py`, `spatial_grid.py`, `temporal_matcher.py`, `calibrator.py`, and `daily_aggregator.py`:

1. **`POST /api/v1/harmonize/pipeline` Request (`PipelineHarmonizeRequest`):**
   - Optional fields with defaults: `region_name` (`"India Regional Corridor"`), `observations` (`None`), `grid_resolution_m` (`1000.0`), `spatial_crs` (`"EPSG:8857"`), `time_window_minutes` (`60.0`), `spatial_match_distance_m` (`1500.0`), `country_code` (`"IND"`), `start_date` (`None`), `end_date` (`None`), `persist_to_db` (`True`).
2. **DB Independence:**
   - **Verified DB-independent ONLY when `observations` is non-empty AND `persist_to_db: false`** (`harmonize.py:49-72`, `harmonizer_engine.py:93`). If `observations` is empty/`None`, it calls `psycopg2.connect(...)` to Member 1's DB and fails if unavailable. `[Verified in source]`
3. **CRITICAL Response Truncation Limitation:**
   - `harmonizer_engine.py:145` returns `"matched_groups_sample": matched_groups[:20]`, **omits all `matched_groups` beyond 20, and omits `modis_only` and `viirs_only` arrays completely!** `[Verified in source]`
   - By contrast, the modular endpoint `POST /api/v1/harmonize/temporal-match` returns the **full** `matched_groups`, `modis_only`, `viirs_only`, and `summary` `[Verified in source in temporal_matcher.py:202-204]`.
   - Therefore, Member 2's adapter **cannot** persist complete match/unmatched records from `/api/v1/harmonize/pipeline` alone unless Member 2 either calls the stage endpoints (`/standardize` → `/spatial-grid` → `/temporal-match` → `/calibrate` → `/daily-activity`) OR Member 1's `run_pipeline()` is extended to optionally return full match/unmatched lists. `[Verified in source]`
4. **Observation ID Survival:**
   - `standardizer.py:262` preserves input `id` as `observation_id`, which survives `spatial_grid.py`, `temporal_matcher.py` (`modis_id`, `viirs_id`, `modis_observation`, `viirs_observation`), and `modis_only`/`viirs_only`. `[Verified in source]`
5. **JSON Serializability:**
   - All stage outputs cast NumPy/pandas types to native Python `float`/`int`/`str` ISO timestamps. `[Verified in source]`
6. **Practical Input Size Limit:**
   - No explicit row limit in `schemas.py` (`observations: Optional[List[Dict[str, Any]]]`). `temporal_matcher.py` uses `bisect` temporal indexing ($O(N \log N + K)$), which is fast in-memory, though Express/FastAPI JSON body limits (`express.json({ limit: '5mb' })` on Member 2) and HTTP timeouts constrain single-payload batch sizes (practical safe batch ~5,000–10,000 observations per request). `[Inferred from source]`
7. **Essential Python Dependencies (`requirements.txt`):**
   - `fastapi`, `uvicorn[standard]`, `pydantic`, `numpy`, `pandas`, `scipy`, `pyproj`, `shapely` (plus `geopandas`, `psycopg2-binary`, `SQLAlchemy`, `python-dotenv`, `httpx`). `[Verified in source]`

---

## 7. Proposed Database Additions (Minimal, Non-Destructive)

To avoid duplicating raw `FireObservation` rows while persisting full harmonization outputs and run provenance:

1. **`HarmonizationRun`** (`harmonization_runs`):
   - `id` (UUID PK), `regionName`, `countryCode`, `minLat`, `maxLat`, `minLon`, `maxLon`, `startDate`, `endDate`, `gridResolutionM` (`1000.0`), `spatialCrs` (`"EPSG:8857"`), `timeWindowMinutes` (`60.0`), `spatialMatchDistanceM` (`1500.0`), `status` (`RUNNING` | `COMPLETED` | `PARTIAL` | `FAILED`), `totalModisInput`, `totalViirsInput`, `matchedPairsCount`, `modisOnlyCount`, `viirsOnlyCount`, `calibrationStatus` (`String`), `isEmpiricallyValidated` (`Boolean`), `calibrationMetrics` (`Json?`), `metadataAndUncertainty` (`Json?`), `errorMessage` (`String?`), `createdAt`, `completedAt`.
2. **`HarmonizedObservationMatch`** (`harmonized_observation_matches`):
   - `id` (UUID PK), `runId` (FK → `HarmonizationRun.id`, `onDelete: Cascade`), `matchStatus` (`MATCHED` | `MODIS_ONLY` | `VIIRS_ONLY`), `modisObservationId` (FK → `FireObservation.id`, `String?`), `viirsObservationId` (FK → `FireObservation.id`, `String?`), `gridCellId` (`String`), `spatialCrs` (`String`), `spatialDistanceM` (`Float?`), `timeDeltaSec` (`Float?`), `costIndex` (`Float?`), `frpRatioViirsToModis` (`Float?`), `acqDate` (`DateTime`).
   - Indexes: `(runId, matchStatus)`, `(runId, gridCellId)`, `(modisObservationId)`, `(viirsObservationId)`.
3. **`HarmonizedDailySummary`** (`harmonized_daily_summaries`):
   - `id` (UUID PK), `runId` (FK → `HarmonizationRun.id`, `onDelete: Cascade`), `date` (`DateTime`), `regionName`, `modisCount`, `viirsCount`, `matchedCount`, `modisOnlyCount`, `viirsOnlyCount`, `effectiveIndependentDetections`, `modisFrpSumMw`, `viirsFrpSumMw`, `experimentalAreaNominalHa` (`Float?`), `experimentalAreaLowerHa` (`Float?`), `experimentalAreaUpperHa` (`Float?`), `unusualActivityFlag` (`Boolean?`), `anomalyZScore` (`Float?`), `uncertaintyNotes` (`Json?`).
   - Unique constraint: `@@unique([runId, date])`.

---

## 8. Proposed Express / TypeScript Adapter Architecture

1. **New Backend Files:**
   - `backend/src/services/harmonizationClient.ts`: Typed Axios client calling Member 1 FastAPI (`env.FASTAPI_SERVICE_URL`, configurable `FASTAPI_TIMEOUT_MS` e.g. 30,000 ms for scientific runs).
   - `backend/src/services/harmonizationService.ts`:
     1. Queries `prisma.fireObservation.findMany(...)` filtered by bounding box (`minLat`, `maxLat`, `minLon`, `maxLon`) and UTC `observationTime` range (`startDate`–`endDate`).
     2. Maps each `FireObservation` to Python `RawObservationInput` (preserving `id`, sending `acq_timestamp: obs.observationTime.toISOString()`).
     3. Creates `HarmonizationRun` (`RUNNING`).
     4. Calls Python stage endpoints (`/standardize` → `/spatial-grid` → `/temporal-match` → `/calibrate` → `/daily-activity`) with `persist_to_db: false` (or `/pipeline` once full match arrays are returned).
     5. Validates response with Zod before DB write.
     6. Persists `HarmonizedObservationMatch` (in 100-row `prisma.$transaction` chunks) and `HarmonizedDailySummary`, updating `HarmonizationRun` to `COMPLETED` (or `FAILED` on error).
   - `backend/src/controllers/harmonizationController.ts` & `backend/src/routes/harmonizationRoutes.ts` mounted at `/api/v1/harmonize`:
     - `POST /api/v1/harmonize/run` (triggers run; supports idempotency key / duplicate parameter check within recent window)
     - `GET /api/v1/harmonize/runs` & `GET /api/v1/harmonize/runs/:id`
     - `GET /api/v1/harmonize/runs/:id/matches` (paginated filterable `MATCHED`, `MODIS_ONLY`, `VIIRS_ONLY`)
     - `GET /api/v1/harmonize/runs/:id/calendar` (daily activity summaries)
     - `GET /api/v1/harmonize/runs/:id/export` (`csv` / `geojson`)
2. **Failure & Large-Dataset Handling:**
   - **Python Service Unavailable (`ECONNREFUSED` / `ETIMEDOUT`):** Catch cleanly, mark `HarmonizationRun` as `FAILED` with diagnostic message, and return HTTP `503 Service Unavailable` without crashing Express or touching raw `fire_observations`.
   - **Large Datasets:** Enforce an upper cap or date-window chunking per run (e.g., max 15,000 observations per request) and return paginated results to the frontend.

---

## 9. Frontend Integration Inventory

| Feature | Actual Files | Current API Dependency | Classification | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Dashboard** | `pages/Dashboard/Dashboard.tsx`, `services/fireIntelligenceService.ts` | `apiClient.getFires()` (falls back to 58 static points) | **CONNECT TO HARMONIZATION** | Fix numeric confidence assumption for VIIRS (`null`); display `DEMONSTRATION DATA` badge on fallback; show harmonized KPIs (`Neff`, match rate). |
| **Hotspot Explorer** | `pages/HotspotExplorer/HotspotExplorer.tsx` | **None** (direct import of `GLOBAL_HOTSPOTS` in `fireData.ts`) | **CONNECT TO HARMONIZATION** | Wire to live `/api/v1/fires` + `/api/v1/harmonize/runs/:id/matches` with toggles for `MODIS_ONLY`, `VIIRS_ONLY`, and `MATCHED`. |
| **Tactical Map** | `components/dashboard/TacticalLeafletMap.tsx`, `DashboardGlobalMap.tsx` | `TacticalLeafletMap` uses `GLOBAL_HOTSPOTS`; `DashboardGlobalMap` receives props | **IMPROVE** | Pass live/harmonized observations into `TacticalLeafletMap` and show match distance/time delta in popups. |
| **Satellite Comparison** | `pages/SatelliteComparison/SatelliteComparison.tsx`, `SatelliteViewer3D.tsx` | **None** (hardcoded `comparisonSpecs` & `detectionComparisonData`) | **CONNECT TO HARMONIZATION** | Keep 3D viewer & pixel simulator; replace hardcoded biome chart with live Stage 3 match rates & Stage 4 Theil-Sen calibration metrics. |
| **Burning Calendar & Historical Analysis** | `pages/HistoricalAnalysis/HistoricalAnalysis.tsx` | **None** (uses `Math.sin()` + `Math.random()` and static `annualTrends`) | **CONNECT TO HARMONIZATION** | Wire to `HarmonizedDailySummary` & `/api/v1/history/statistics` for real AOI burning activity calendar & unusual-activity flags. |
| **Methodology** | `pages/Methodology/Methodology.tsx` | None (static) | **IMPROVE** | Add Equal Earth (`EPSG:8857`) grid, bipartite temporal matching, calibration validation, and experimental 6h FRE proxy disclaimers. |
| **Satellite Imagery** | `DedicatedSatelliteWorkspace.tsx`, `SatelliteImageryViewer.tsx`, `satelliteImageryService.ts` | Direct NASA GIBS WMS + EOX Sentinel-2 | **KEEP** | Fully functional real satellite raster viewer. |
| **Weather** | `backend/src/services/weatherService.ts`, `apiClient.getWeatherNearby()` | `GET /api/v1/weather/nearby` (Open-Meteo) | **KEEP** | Functional live atmospheric context. |
| **Alerts & Saved Locations** | `backend/src/routes/userRoutes.ts`, `userController.ts` | Protected JWT CRUD exists in backend; no frontend UI | **OPTIONAL** | Surface saved AOIs as quick region presets for harmonization runs. |
| **Data Export** | *(Missing — only raster download in `SatelliteImageryViewer.tsx`)* | None | **CONNECT TO HARMONIZATION** | Add CSV/GeoJSON export for harmonized matches and daily calendar summaries. |

---

## 10. Scientific and Engineering Risks

1. **`/api/v1/harmonize/pipeline` Truncation:** Returns only `matched_groups_sample[:20]` and drops `modis_only` / `viirs_only` `[Verified in source]`. Integrating `/pipeline` blindly would silently lose almost all match records.
2. **ISO Timestamp Overwrite in `standardizer.py`:** Passing `acq_date` as an ISO midnight string alongside `acq_time` causes `parse_utc_timestamp()` to ignore `acq_time` `[Verified in source]`.
3. **Null Value Coercion in `standardizer.py`:** Missing `frp` becomes `0.0`, missing `brightness` becomes `300.0` K, and missing `confidence` becomes `"NOMINAL"` (`50`) `[Verified in source]`. Missing data must be flagged in metadata/uncertainty rather than treated as measured zero-FRP.
4. **Missing `country` Column & Coarse Region Classifier:** `FireObservation` lacks `countryCode`, and `FireService.classifyLocation()` omits Northeast India (`lon > 90`) `[Verified in source]`.
5. **Synthetic Endpoints & Badges in Member 2:** `FireService.getDiurnalTrends()` uses `Math.sin()`, `Dashboard.tsx` uses silent 58-point fallback, and `App.tsx` displays a hardcoded `SAT FEEDS ONLINE` badge `[Verified in source]`.
6. **Scientific Interpretation Safeguards:** Candidate co-detections (`MATCHED`) only indicate spatiotemporal proximity within `(spatial_match_distance_m, time_window_minutes)`, not physical pixel-footprint identity; 6-hour FRE burned-area estimates in `daily_aggregator.py` are explicitly experimental proxies; hotspots are thermal anomalies, not confirmed wildfires.

---

## 11. Missing Information and Unresolved Questions

1. **Live PostgreSQL & NASA FIRMS Key:** Local PostgreSQL (`127.0.0.1:5432`) is offline and `NASA_FIRMS_MAP_KEY` is empty in `backend/.env`; live India FIRMS ingestion has not yet been tested `[Verified in source]`.
2. **Member 1 Python Environment Verification:** Whether Python 3.x with `fastapi`, `numpy`, `pandas`, `scipy`, `pyproj`, `shapely`, and `geopandas` is currently installed and runnable in a venv on this machine is `[Not verified]`.
3. **Full Match Return Strategy:** Confirm whether Member 2 should orchestrate Member 1's modular stage endpoints (`/standardize` → `/spatial-grid` → `/temporal-match` → `/calibrate` → `/daily-activity`) OR add an optional `include_full_matches: bool = False` flag to Member 1's `/api/v1/harmonize/pipeline`.

---

## 12. Recommended Implementation Sequence

1. **Prerequisite (Stage 1 Live Verification):** Start PostgreSQL 18, apply schema (`npx.cmd prisma db push`), set `NASA_FIRMS_MAP_KEY` in `backend/.env`, and verify real India MODIS/VIIRS ingestion.
2. **Verify Member 1 FastAPI Runtime:** Boot `scientific-service` on port `8000` (`GET /api/v1/health`) without Member 1 DB writes (`persist_to_db: false`).
3. **Member 2 Schema Extension:** Add `HarmonizationRun`, `HarmonizedObservationMatch`, and `HarmonizedDailySummary` to `backend/prisma/schema.prisma` and apply non-destructive migration.
4. **Member 2 Express Adapter & Routes:** Implement `harmonizationClient.ts`, `harmonizationService.ts` (calling modular stage endpoints so full `matched_groups`, `modis_only`, and `viirs_only` are retrieved), `harmonizationController.ts`, `harmonizationRoutes.ts`, and mocked unit tests.
5. **Frontend Integration:** Wire `Dashboard.tsx`, `HotspotExplorer.tsx`, `SatelliteComparison.tsx`, `HistoricalAnalysis.tsx`, `Methodology.tsx`, and CSV/GeoJSON export, plus explicit `DEMONSTRATION DATA` labels on offline fallbacks.

---

## 13. Explicit List of Files for Future Implementation Stage

- **Database & Config:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/<new_migration>/migration.sql`, `backend/src/config/env.ts`, `backend/.env.example`, `.env.example`
- **Backend New Files:** `backend/src/services/harmonizationClient.ts`, `backend/src/services/harmonizationService.ts`, `backend/src/controllers/harmonizationController.ts`, `backend/src/routes/harmonizationRoutes.ts`, `backend/src/services/harmonizationService.test.ts`
- **Backend Modified Files:** `backend/src/routes/index.ts`, `backend/src/types/index.ts`, `backend/src/services/fireService.ts` (fix `getDiurnalTrends` & `classifyLocation`), `backend/src/app.ts` (OpenAPI spec)
- **Frontend Modified Files:** `frontend/src/services/apiClient.ts`, `frontend/src/services/fireIntelligenceService.ts`, `frontend/src/App.tsx`, `frontend/src/pages/Dashboard/Dashboard.tsx`, `frontend/src/pages/HotspotExplorer/HotspotExplorer.tsx`, `frontend/src/components/dashboard/TacticalLeafletMap.tsx`, `frontend/src/pages/SatelliteComparison/SatelliteComparison.tsx`, `frontend/src/pages/HistoricalAnalysis/HistoricalAnalysis.tsx`, `frontend/src/pages/Methodology/Methodology.tsx`
- **Optional Minimal Member 1 Adjustment (only if single-call `/pipeline` is preferred over stage orchestration):** `C:\Users\PRUTHVIRAJ\Documents\FireSync\scientific-service\app\services\harmonizer_engine.py` & `app/models/schemas.py`

---

## Compatibility Verdict: **READY AFTER SPECIFIED FIXES**

### Specific Reasons
1. **Compatible Architecture & IDs:** Member 2's Stage 1 `FireObservation` schema now preserves all required scientific inputs (`id`, `latitude`, `longitude`, `sensor`, `satellitePlatform`, UTC `observationTime`, `frp`, `brightnessTemp`, `confidenceRaw`, `confidenceCategory`, `dayNight`, `scan`, `track`, `sourceDataset`, `version`), and Member 1's pipeline preserves `id` → `observation_id` across all 5 stages and runs without Member 1's DB when `observations` are passed and `persist_to_db=false`.
2. **Specified Fixes Required Before Integration:**
   - Member 2 must handle `/api/v1/harmonize/pipeline`'s `matched_groups_sample[:20]` truncation by calling the full-output stage endpoints (`/standardize` → `/spatial-grid` → `/temporal-match` → `/calibrate` → `/daily-activity`) or extending Member 1's response.
   - The adapter must pass `acq_timestamp: obs.observationTime.toISOString()` without an ISO midnight `acq_date` so `standardizer.parse_utc_timestamp()` does not drop time-of-day.
   - Local PostgreSQL (`127.0.0.1:5432`) and `NASA_FIRMS_MAP_KEY` must be active for live end-to-end validation, and new Prisma models (`HarmonizationRun`, `HarmonizedObservationMatch`, `HarmonizedDailySummary`) must be added to persist results.

