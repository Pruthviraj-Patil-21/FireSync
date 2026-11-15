# Stage 2 Report: MODIS–VIIRS Hotspot Harmonization Engine Implementation

**Project**: FireSync (`C:\Users\PRUTHVIRAJ\Documents\nasa-project\FireSync`)  
**Challenge**: NASA Space Apps Challenge 2026 — *Harmonization of MODIS and VIIRS Hot Spots*  
**Architecture**: React 18 + TypeScript + Vite | Express + TypeScript | Prisma ORM + PostgreSQL (No Python microservice)

---

## 1. Files Created or Modified

### Created
- `backend/src/services/harmonizationService.ts` — Closed-form Equal Earth (`EPSG:8857`) spatial grid (`projectEqualEarth`, `assignSpatialGridCell`), data preparation preserving nulls (`prepareHarmonizationInputs`), 1:1 bipartite spatiotemporal matching (`runHarmonizationAlgorithm`), daily aggregation, and Prisma persistence (`HarmonizationService`).
- `backend/src/controllers/harmonizationController.ts` — Zod-validated request handlers for `run`, `status`, `results`, and `daily`.
- `backend/src/routes/harmonizationRoutes.ts` — Express router for `/run`, `/status`, `/results`, and `/daily`.
- `backend/src/services/harmonizationService.test.ts` — 10 unit & mocked-DB tests covering all harmonization edge cases.
- `backend/prisma/migrations/20261112120000_harmonization_models/migration.sql` — Non-destructive `CREATE TABLE IF NOT EXISTS` SQL migration for harmonization tables.
- `frontend/src/pages/Harmonization/Harmonization.tsx` — Harmonization workspace with configurable thresholds, KPI cards, daily Recharts visualizations, match/unmatched explorer, and honest empty/offline states.

### Modified
- `backend/prisma/schema.prisma` — Added `HarmonizationRunStatus`, `HarmonizationMatchClass`, `HarmonizationRun`, `HarmonizedObservationMatch`, `HarmonizedDailySummary`, and reverse relations on `FireObservation`.
- `backend/src/routes/index.ts` & `backend/src/app.ts` — Mounted harmonization routes at `/api/harmonization` and `/api/v1/harmonization`.
- `frontend/src/services/apiClient.ts` — Added `runHarmonization`, `getHarmonizationStatus`, `getHarmonizationResults`, and `getHarmonizationDaily` (no fabricated fallback data).
- `frontend/src/App.tsx` — Added `HARMONIZATION` navigation link and `/harmonization` route.

---

## 2. Database Schema Changes

Added three non-destructive models in `backend/prisma/schema.prisma` and regenerated Prisma Client (`npx.cmd prisma generate`):

- **`HarmonizationRun`** (`harmonization_runs`):
  - Stores AOI bounding box (`minLat`, `maxLat`, `minLon`, `maxLon`), date range (`startDate`, `endDate`), `gridResolutionM` (default `1000`), `spatialCrs` (`EPSG:8857`), `spatialDistanceM` (default `1500`), `timeWindowMinutes` (default `60`), run `status`, counts (`validModisCount`, `validViirsCount`, `rejectedCount`, `candidateMatchCount`, `modisOnlyCount`, `viirsOnlyCount`, `uniqueGridCells`), and `scientificNotes`.
- **`HarmonizedObservationMatch`** (`harmonized_observation_matches`):
  - References `FireObservation.id` via `modisObservationId` and `viirsObservationId`, stores `matchClass` (`CANDIDATE_MATCH`, `MODIS_ONLY`, `VIIRS_ONLY`), unambiguous `gridCellId` (e.g., `EE_1000M_X..._Y...`), `distanceM`, `timeDiffMinutes`, `matchScore`, and `@@unique([runId, matchKey])` to prevent duplicate entries.
- **`HarmonizedDailySummary`** (`harmonized_daily_summaries`):
  - Stores per-UTC-date sensor counts, candidate/unmatched counts, separate valid FRP summaries per sensor (`modisValidFrpCount`, `modisFrpSumMw`, `modisFrpMeanMw`, `modisFrpMaxMw`, and VIIRS equivalents), and `estimatedBurnedAreaHa: null` with provenance/uncertainty notes.

---

## 3. APIs Implemented

Mounted at both `/api/harmonization/*` and `/api/v1/harmonization/*`:

- **`POST /api/harmonization/run`** — Runs harmonization for configurable `regionName`, bounding box, `startDate`/`endDate`, `spatialDistanceM`, `timeWindowMinutes`, and `gridResolutionM`.
- **`GET /api/harmonization/status`** — Returns `latestRun` and `recentRuns`.
- **`GET /api/harmonization/results`** — Returns paginated `HarmonizedObservationMatch` records with joined `modisObservation` and `viirsObservation` details, filterable by `runId` and `matchClass`.
- **`GET /api/harmonization/daily`** — Returns `HarmonizedDailySummary` records filterable by `runId`, `startDate`, and `endDate`.

---

## 4. Frontend Features Connected

- Added `/harmonization` (`HARMONIZATION` in the top navigation bar) rendering `frontend/src/pages/Harmonization/Harmonization.tsx`.
- Connected directly to `/api/harmonization/run`, `/status`, `/results`, and `/daily` via `frontend/src/services/apiClient.ts`.
- Displays configurable India/custom matching parameters, latest run status & scientific disclaimers, separate MODIS/VIIRS/Candidate/Unmatched KPIs, daily activity & mean FRP charts, daily summary table, and filterable match classification table (`ALL`, `CANDIDATE_MATCH`, `MODIS_ONLY`, `VIIRS_ONLY`).
- Existing pages (Dashboard, Hotspot Explorer, Satellite Comparison, Historical Analysis, Methodology, Landing Page) remain intact.

---

## 5. Tests and Build Results

- **Prisma Client Generation** (`cd backend; npx.cmd prisma generate`): **Passed** (exit code `0`).
- **Backend TypeScript Build** (`cd backend; npm.cmd run build`): **Passed** (exit code `0`).
- **Backend Unit & Algorithm Tests** (`cd backend; node --test dist/services/firmsIngestionService.test.js dist/services/harmonizationService.test.js`): **22 / 22 passed** (`pass 22, fail 0`), including all 10 new harmonization tests:
  - Equal Earth cell ID uniqueness across `1000m`, `500m`, `250m`
  - Matching within thresholds (`1500m`, `60m`)
  - Observations outside spatial/temporal thresholds
  - `MODIS_ONLY` and `VIIRS_ONLY` datasets
  - Null FRP/confidence preservation & VIIRS categorical confidence integrity
  - Invalid timestamps/coordinates rejection & duplicate deduplication
  - One-to-one bipartite matching preventing double-matches
  - Empty dataset handling
  - Daily aggregation count conservation & mocked Prisma persistence
- **Frontend Build** (`cd frontend; npm.cmd run build`): **Passed** (exit code `0`, `3,177` modules transformed).

---

## 6. Remaining Blockers

- **Local PostgreSQL Offline**: PostgreSQL (`127.0.0.1:5432`) was not running during this session, so the schema push (`npx.cmd prisma db push`) and live end-to-end DB/API runs against ingested NASA FIRMS records remain pending until PostgreSQL is started and `NASA_FIRMS_MAP_KEY` is configured in `backend/.env`.

---

## 7. Exact Commands to Run Locally

1. **Start PostgreSQL 18** on port `5432` (database `firesync`) and set `NASA_FIRMS_MAP_KEY` in `backend/.env`.
2. **Apply schema non-destructively**:
   ```powershell
   cd backend
   npx.cmd prisma db push
   ```
3. **Start Backend & Frontend**:
   ```powershell
   npm.cmd run dev
   ```
   Then visit **`http://localhost:5173/harmonization`**.

