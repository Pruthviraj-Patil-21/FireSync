# Stage 1 Report: NASA FIRMS Data Ingestion Implementation

**Challenge**: NASA Space Apps Challenge 2026 — *Harmonization of MODIS and VIIRS Hot Spots*  
**Initial Geographic Focus**: India (`IND` / bounding box `68.0,6.5,97.5,37.5`)

---

## 1. Files Inspected

- `backend/src/services/firmsIngestionService.ts`
- `backend/src/services/firmsIngestionService.test.ts`
- `backend/src/services/fireService.ts`
- `backend/src/jobs/scheduler.ts`
- `backend/src/config/env.ts`
- `backend/src/controllers/systemController.ts`
- `backend/src/controllers/fireController.ts`
- `backend/src/routes/systemRoutes.ts`
- `backend/src/types/index.ts`
- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/package.json`
- `backend/.env` (key presence only; secrets not read/exposed) and `backend/.env.example`
- `.env.example`
- `FIRESYNC_PROJECT_AUDIT.md`

### Key Findings from Inspection
Before Stage 1 changes, `firmsIngestionService.ts` had the following defects:
1. Hardcoded query URL to `/api/country/csv/{MAP_KEY}/{source}/USA/1` for only `VIIRS_NOAA20_NRT` and `MODIS_NRT`, capped at 200 rows.
2. Assigned `observationTime: new Date()` (server ingestion instant) instead of parsing `acq_date` and `acq_time`.
3. Called `parseFloat()` on VIIRS categorical confidence (`'l'`, `'n'`, `'h'`), producing `NaN` and falling back to an arbitrary hardcoded `85`.
4. Hardcoded `satellitePlatform` as `'NOAA-20'` for all VIIRS and `'Terra'` for all MODIS, ignoring the CSV `satellite` column (`T`, `A`, `N`, `N20`, `N21`).
5. When `NASA_FIRMS_MAP_KEY` was unset or the API call failed, silently inserted 5 hardcoded global mock points (`verifiedSamples`) labeled as `NASA_FIRMS_VIIRS_NRT` / `NASA_FIRMS_MODIS_NRT`.
6. `ingestObservations` incremented `inserted` for both inserts and updates (`updated` stayed `0`), and rounded `sourceId` coordinates to 3 decimal places (`~111 m`), risking collisions between adjacent 375 m VIIRS pixels.

---

## 2. Files Modified & Created

### Modified
- `backend/prisma/schema.prisma` — Updated `FireObservation` model with nullable `confidence`, provenance fields, dual brightness channels, and composite indices.
- `backend/src/config/env.ts` — Added Zod-validated configurable FIRMS API variables defaulting to India (`IND`).
- `backend/src/types/index.ts` — Updated `FireQueryParams` and `EnrichedFireObservationDto` for nullable numeric confidence, raw confidence, categorical confidence tier, satellite code, version, and ingestion timestamp.
- `backend/src/services/firmsIngestionService.ts` — Replaced mock fallback and broken CSV parsing with verified FIRMS API integration, strict UTC timestamp parsing, accurate satellite/platform identification, proper confidence handling, and chunked transactional deduplication.
- `backend/src/services/fireService.ts` — Updated observation enrichment, `NOAA-21` VIIRS detection, `confidenceCategory` filtering, and high-confidence overview count (`confidenceCategory === 'HIGH' || confidence >= 80`).
- `backend/src/controllers/fireController.ts` — Added optional `confidenceCategory` query filter forwarding.
- `backend/src/services/firmsIngestionService.test.ts` — Added 10 new unit & mocked pipeline tests (13 tests total).
- `backend/.env.example` & `.env.example` — Documented FIRMS configuration variables with placeholder/non-secret defaults.

### Created
- `backend/prisma/migrations/20261112000000_firms_ingestion_fields/migration.sql` — Non-destructive `ALTER TABLE` SQL migration script for existing PostgreSQL databases.
- `STAGE_1_FIRMS_INGESTION_REPORT.md` — This report.

---

## 3. How FIRMS Data Is Fetched

Implemented in `buildFirmsRequestUrl()` and `FirmsIngestionService.executeSyncJob()` in `backend/src/services/firmsIngestionService.ts`:

- **Verified Sources Supported** (`VERIFIED_FIRMS_SOURCES`):
  `MODIS_NRT`, `MODIS_SP`, `VIIRS_SNPP_NRT`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_NRT`. Unverified source strings are logged and skipped.
- **Default Configuration (India)**:
  - `FIRMS_QUERY_MODE=country` with `FIRMS_COUNTRY_CODE=IND` queries:
    `https://firms.modaps.eosdis.nasa.gov/api/country/csv/{MAP_KEY}/{SOURCE}/IND/{DAY_RANGE}[/{DATE}]`
  - `FIRMS_QUERY_MODE=area` with `FIRMS_AREA_BBOX=68.0,6.5,97.5,37.5` (or custom bbox / `world`) queries:
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{BBOX}/{DAY_RANGE}[/{DATE}]`
  - Default `FIRMS_SOURCES`: `MODIS_NRT,VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT`.
- **Missing API Key Behavior**:
  If `NASA_FIRMS_MAP_KEY` is empty or unset, `executeSyncJob()` logs a warning and returns `{ status: 'SKIPPED', reason: 'NASA_FIRMS_MAP_KEY is not configured' }`. **No mock or fallback observations are inserted.**
- **Error, Rate-Limit, & Empty Response Handling**:
  - HTTP 429 rate limits, network errors, timeouts, and FIRMS plain-text HTTP 200 error messages (`Invalid MAP_KEY.`, `Exceeded maximum...`, etc.) are caught per source, logged via Winston, and recorded in `data_ingestion_logs` with `status = FAILED` and `errorMessage`.
  - Empty strings, `"No data"`, or header-only CSVs are recorded cleanly as `EMPTY` / `SUCCESS` with `0` rows without throwing errors.
  - All valid CSV rows returned are parsed (the prior 200-row cap was removed).

---

## 4. How Timestamps Are Parsed

Implemented in `parseFirmsAcquisitionTimestamp(acqDateRaw, acqTimeRaw)` in `backend/src/services/firmsIngestionService.ts`:

- Parses `acq_date` strictly matching `YYYY-MM-DD` and `acq_time` strictly matching 1–4 digits (left-padded with `'0'` to `HHMM` UTC, e.g., `'45'` $\rightarrow$ `'0045'` $\rightarrow$ `00:45 UTC`).
- Constructs UTC dates via `Date.UTC(...)`:
  - `observationTime`: exact UTC acquisition instant (`YYYY-MM-DDTHH:MM:00.000Z`).
  - `acquisitionDate`: UTC date at `00:00:00.000Z`.
- Verifies calendar integrity (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`, `getUTCHours`, `getUTCMinutes`) to reject invalid calendar rollovers such as `2026-02-30` or invalid hours/minutes (`2400`, `1260`).
- **Missing or invalid timestamps are never replaced with `new Date()`.** Rows with invalid timestamps are skipped individually and counted under `skippedCount` / `recordsFailed`.
- Server ingestion time remains separate in Prisma's `ingestedAt` column (`@default(now())`).

---

## 5. How Sensor and Platform Identification Works

Implemented in `identifyFirmsSensorAndPlatform(source, satelliteRaw, instrumentRaw)`:

- **Sensor Family (`sensor`)**: Derived from verified FIRMS source prefix (`MODIS*` $\rightarrow$ `'MODIS'`, `VIIRS*` $\rightarrow$ `'VIIRS'`) or CSV `instrument` column.
- **Platform Mapping (`satellitePlatform`)** & **Original Code (`satelliteCode`)**:
  - `'T'` / `'Terra'` $\rightarrow$ `'Terra'`
  - `'A'` / `'Aqua'` $\rightarrow$ `'Aqua'`
  - `'N'` / `'NPP'` / `'Suomi-NPP'` $\rightarrow$ `'Suomi-NPP'`
  - `'N20'` / `'NOAA-20'` / `'J1'` (or `'1'` when source is `VIIRS_NOAA20_*`) $\rightarrow$ `'NOAA-20'`
  - `'N21'` / `'NOAA-21'` / `'J2'` (or `'2'` when source is `VIIRS_NOAA21_*`) $\rightarrow$ `'NOAA-21'`
  - If `satellite` is empty on single-platform VIIRS feeds (`VIIRS_SNPP_*`, `VIIRS_NOAA20_*`, `VIIRS_NOAA21_*`), platform is derived from the feed source.
  - On multi-platform `MODIS_NRT` / `MODIS_SP`, missing/unrecognized `satellite` codes are labeled `'Unknown MODIS'` rather than guessing `'Terra'`.
- Original `sourceDataset` (e.g., `VIIRS_NOAA20_NRT`) and `satelliteCode` (e.g., `N20`, `T`, `A`) are stored alongside `sensor` and `satellitePlatform`.

---

## 6. How Confidence Values Are Stored

Implemented in `parseFirmsConfidence(sensor, confidenceRaw)` and `FireObservation`:

- `confidenceRaw` (`String?`): Preserves the exact trimmed CSV string (`"l"`, `"n"`, `"h"`, `"92"`, etc.).
- `confidence` (`Float?`):
  - **VIIRS categorical values** (`l`, `n`, `h`, `low`, `nominal`, `high`): `parseFloat()` is **not** called; `confidence` is stored as `null` rather than inventing unvalidated numeric probabilities or defaulting to `85`.
  - **MODIS numeric values**: Validated strictly against `/^\d+(\.\d+)?$/` in `[0, 100]` and stored as the numeric value (`0`–`100`). Invalid strings/out-of-range numbers yield `null`.
- `confidenceCategory` (`String?`): Normalized tier (`'LOW'`, `'NOMINAL'`, `'HIGH'`):
  - VIIRS: `l` $\rightarrow$ `'LOW'`, `n` $\rightarrow$ `'NOMINAL'`, `h` $\rightarrow$ `'HIGH'`.
  - MODIS (NASA FIRMS User Guide thresholds): `< 30` $\rightarrow$ `'LOW'`, `30–79.99` $\rightarrow$ `'NOMINAL'`, `>= 80` $\rightarrow$ `'HIGH'`.

---

## 7. How Duplicates Are Handled

Implemented in `buildDeterministicSourceId()` and `FirmsIngestionService.ingestObservations()`:

- Deterministic `sourceId` key:
  `firms_{sourceDataset}_{satelliteCode|platform}_{lat.toFixed(5)}_{lon.toFixed(5)}_{observationTime.toISOString()}`
  (5 decimal places $\approx 1.1\text{ m}$ precision prevents adjacent 375 m VIIRS pixels from colliding).
- Within a single CSV payload, duplicate rows sharing the same `sourceId` are deduplicated in-memory before DB writes.
- Database writes execute in chunked `prisma.$transaction` batches (100 rows per chunk) using `fireObservation.upsert` keyed by `sourceId`.
- Existing `sourceId`s in each chunk are queried beforehand so `recordsInserted` and `recordsUpdated` are counted accurately.
- Existing raw observations are never deleted; immutable provenance (`observationTime`, `acquisitionDate`, `satellitePlatform`, `sensor`, `sourceDataset`, `ingestedAt`) is preserved on upsert updates.

---

## 8. Database Schema & Migration Changes

**Why changes were needed**:
- `confidence` was previously non-nullable `Float`, forcing VIIRS categorical strings (`l`/`n`/`h`) to be fabricated as numbers.
- Original FIRMS fields (`confidence_raw`, `confidence_category`, `satellite_code`, secondary thermal channel `bright_t31`/`bright_ti5`, `version`) were discarded during ingestion.
- Queries filtering by `(sensor, observation_time)` lacked a composite index.

**Changes Applied**:
1. Updated `backend/prisma/schema.prisma` (`FireObservation`):
   - `confidence Float?` (nullable)
   - Added `satelliteCode`, `confidenceRaw`, `confidenceCategory`, `brightnessTemp31`, `version`
   - Added `@@index([confidenceCategory])` and `@@index([sensor, observationTime])`
2. Regenerated Prisma Client (`npx.cmd prisma generate` succeeded).
3. Created non-destructive migration SQL: `backend/prisma/migrations/20261112000000_firms_ingestion_fields/migration.sql`.

*(Note: PostgreSQL was not running locally during this session, so the SQL migration / `prisma db push` has **not** yet been applied against a live database instance.)*

---

## 9. Tests Executed and Results

### Build Check
- **Command**: `cd backend; npm.cmd run build` (`tsc`)
- **Result**: **Passed** (exit code `0`, 0 TypeScript errors).

### Unit & Mocked Pipeline Tests
- **Command**: `cd backend; node --test dist/services/firmsIngestionService.test.js`
- **Result**: **13 / 13 tests passed** (`pass 13, fail 0, skipped 0`):
  1. `haversineDistanceKm` accuracy & zero-distance checks (2 tests)
  2. `classifyLocation` continent/country resolution including India (1 test)
  3. Valid `acq_date` + `acq_time` UTC parsing including unpadded `HHMM` (`'45'`, `'0'`)
  4. Invalid timestamps (missing values, calendar rollover `2026-02-30`, `2400`, `1260`, `'abcd'`) returning `null`
  5. VIIRS categorical confidence (`l`, `n`, `h`) -> `confidenceNumeric: null`, `confidenceRaw`, `confidenceCategory`
  6. MODIS numeric confidence (`20`, `65`, `92`) + invalid strings (`'85abc'`, `'125'`) without `85` fallback
  7. Satellite & platform identification (`T`->Terra, `A`->Aqua, `N`->Suomi-NPP, `N20`->NOAA-20, `N21`->NOAA-21, missing MODIS code->`'Unknown MODIS'`)
  8. Malformed CSV row skipping + valid MODIS/VIIRS field retention (`bright_ti4`, `bright_ti5`, `frp`, `daynight`, `version`)
  9. Duplicate observation deduplication within same CSV and across repeated ingestion runs (mocked Prisma client)
  10. Empty / header-only FIRMS API response handling
  11. API failure handling (HTTP 429 rate limit, plain-text `Invalid MAP_KEY.`, empty `NASA_FIRMS_MAP_KEY`) ensuring 0 mock observations are inserted
  12. `buildFirmsRequestUrl` URL construction for India (`IND` country mode and `68.0,6.5,97.5,37.5` area mode)

*(Note: `backend/src/api.test.ts` was **not** executed because it requires a live running backend server, `/tmp/firesync.sock` POSIX socket, and a live PostgreSQL database.)*

---

## 10. Remaining Limitations

1. **Live NASA FIRMS API Not Executed**: `NASA_FIRMS_MAP_KEY` is currently empty in `backend/.env`, and live external network verification against `firms.modaps.eosdis.nasa.gov` was not performed. All ingestion pipeline tests used mocked HTTP responses and an in-memory mocked Prisma client.
2. **PostgreSQL Instance Offline**: Local PostgreSQL (`127.0.0.1:5432`) did not respond during this session; therefore, `prisma db push` / `migration.sql` has not yet been applied to the live database.
3. **Frontend Confidence Filter Behavior**: In the frontend (`Dashboard.tsx` / `fireIntelligenceService.ts`), numeric confidence filters (`h.confidence >= tableConfidenceFilter`) may need minor Stage 2/UI updates later if VIIRS observations return `confidence: null` with `confidenceCategory` instead of a numeric score.
4. **Harmonization Not Implemented (Out of Scope for Stage 1)**: As instructed, cross-sensor MODIS/VIIRS spatial grid matching and unified FRP calibration were not implemented in Stage 1; `clusterAndAssignIncidents()` remains unchanged.

---

## 11. Exact Commands Needed to Run the Implementation

1. **Start PostgreSQL locally** on port `5432` and ensure database `firesync` exists.
2. **Configure `backend/.env`**:
   - Set `DATABASE_URL=postgresql://postgres:<password>@localhost:5432/firesync`
   - Set your real `NASA_FIRMS_MAP_KEY=<your_firms_map_key>`
   - Verify `FIRMS_QUERY_MODE=country` and `FIRMS_COUNTRY_CODE=IND` (or `FIRMS_QUERY_MODE=area` with `FIRMS_AREA_BBOX=68.0,6.5,97.5,37.5`)
3. **Apply schema changes to PostgreSQL** (non-destructive):
   ```powershell
   cd backend
   npx.cmd prisma db push
   ```
   *(Or apply `backend/prisma/migrations/20261112000000_firms_ingestion_fields/migration.sql` via `psql` on an existing database.)*
4. **Build and run tests**:
   ```powershell
   cd backend
   npm.cmd run build
   node --test dist/services/firmsIngestionService.test.js
   ```
5. **Run the backend server & trigger live ingestion**:
   ```powershell
   cd backend
   npm.cmd run dev
   ```
   Then trigger a manual sync or wait for the configured `INGESTION_CRON` (`*/15 * * * *`):
   ```powershell
   Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/v1/system/trigger-ingestion
   Invoke-RestMethod -Method Get -Uri http://localhost:5000/api/v1/system/ingestion-status
   ```

