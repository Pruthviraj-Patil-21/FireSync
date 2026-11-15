-- Non-destructive migration for Stage 2 MODIS-VIIRS Harmonization Engine
-- Adds HarmonizationRun, HarmonizedObservationMatch, and HarmonizedDailySummary without modifying raw FireObservation rows.

DO $$ BEGIN
  CREATE TYPE "HarmonizationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "HarmonizationMatchClass" AS ENUM ('CANDIDATE_MATCH', 'MODIS_ONLY', 'VIIRS_ONLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "harmonization_runs" (
  "id" TEXT NOT NULL,
  "region_name" TEXT NOT NULL,
  "min_lat" DOUBLE PRECISION,
  "max_lat" DOUBLE PRECISION,
  "min_lon" DOUBLE PRECISION,
  "max_lon" DOUBLE PRECISION,
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "grid_resolution_m" DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
  "spatial_crs" TEXT NOT NULL DEFAULT 'EPSG:8857',
  "spatial_distance_m" DOUBLE PRECISION NOT NULL DEFAULT 1500.0,
  "time_window_minutes" DOUBLE PRECISION NOT NULL DEFAULT 60.0,
  "status" "HarmonizationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "total_input_observations" INTEGER NOT NULL DEFAULT 0,
  "valid_modis_count" INTEGER NOT NULL DEFAULT 0,
  "valid_viirs_count" INTEGER NOT NULL DEFAULT 0,
  "rejected_count" INTEGER NOT NULL DEFAULT 0,
  "candidate_match_count" INTEGER NOT NULL DEFAULT 0,
  "modis_only_count" INTEGER NOT NULL DEFAULT 0,
  "viirs_only_count" INTEGER NOT NULL DEFAULT 0,
  "unique_grid_cells" INTEGER NOT NULL DEFAULT 0,
  "scientific_notes" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "harmonization_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "harmonized_observation_matches" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "match_key" TEXT NOT NULL,
  "match_class" "HarmonizationMatchClass" NOT NULL,
  "modis_observation_id" TEXT,
  "viirs_observation_id" TEXT,
  "grid_cell_id" TEXT NOT NULL,
  "spatial_crs" TEXT NOT NULL DEFAULT 'EPSG:8857',
  "grid_resolution_m" DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
  "distance_m" DOUBLE PRECISION,
  "time_diff_minutes" DOUBLE PRECISION,
  "match_score" DOUBLE PRECISION,
  "matching_criteria" JSONB,
  "acq_date" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harmonized_observation_matches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "harmonized_daily_summaries" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "region_name" TEXT NOT NULL,
  "modis_count" INTEGER NOT NULL DEFAULT 0,
  "viirs_count" INTEGER NOT NULL DEFAULT 0,
  "candidate_match_count" INTEGER NOT NULL DEFAULT 0,
  "modis_only_count" INTEGER NOT NULL DEFAULT 0,
  "viirs_only_count" INTEGER NOT NULL DEFAULT 0,
  "unique_grid_cells" INTEGER NOT NULL DEFAULT 0,
  "modis_valid_frp_count" INTEGER NOT NULL DEFAULT 0,
  "modis_frp_sum_mw" DOUBLE PRECISION,
  "modis_frp_mean_mw" DOUBLE PRECISION,
  "modis_frp_max_mw" DOUBLE PRECISION,
  "viirs_valid_frp_count" INTEGER NOT NULL DEFAULT 0,
  "viirs_frp_sum_mw" DOUBLE PRECISION,
  "viirs_frp_mean_mw" DOUBLE PRECISION,
  "viirs_frp_max_mw" DOUBLE PRECISION,
  "estimated_burned_area_ha" DOUBLE PRECISION,
  "provenance_and_notes" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "harmonized_daily_summaries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "harmonization_runs_status_created_at_idx" ON "harmonization_runs"("status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "harmonized_observation_matches_run_id_match_key_key" ON "harmonized_observation_matches"("run_id", "match_key");
CREATE INDEX IF NOT EXISTS "harmonized_observation_matches_run_id_match_class_idx" ON "harmonized_observation_matches"("run_id", "match_class");
CREATE INDEX IF NOT EXISTS "harmonized_observation_matches_run_id_grid_cell_id_idx" ON "harmonized_observation_matches"("run_id", "grid_cell_id");
CREATE INDEX IF NOT EXISTS "harmonized_observation_matches_modis_observation_id_idx" ON "harmonized_observation_matches"("modis_observation_id");
CREATE INDEX IF NOT EXISTS "harmonized_observation_matches_viirs_observation_id_idx" ON "harmonized_observation_matches"("viirs_observation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "harmonized_daily_summaries_run_id_date_key" ON "harmonized_daily_summaries"("run_id", "date");
CREATE INDEX IF NOT EXISTS "harmonized_daily_summaries_date_idx" ON "harmonized_daily_summaries"("date");

DO $$ BEGIN
  ALTER TABLE "harmonized_observation_matches" ADD CONSTRAINT "harmonized_observation_matches_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harmonization_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "harmonized_observation_matches" ADD CONSTRAINT "harmonized_observation_matches_modis_observation_id_fkey" FOREIGN KEY ("modis_observation_id") REFERENCES "fire_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "harmonized_observation_matches" ADD CONSTRAINT "harmonized_observation_matches_viirs_observation_id_fkey" FOREIGN KEY ("viirs_observation_id") REFERENCES "fire_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "harmonized_daily_summaries" ADD CONSTRAINT "harmonized_daily_summaries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harmonization_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

