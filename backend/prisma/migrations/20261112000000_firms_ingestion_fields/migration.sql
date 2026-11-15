-- Non-destructive incremental migration for Stage 1 NASA FIRMS Ingestion
-- Preserves existing FireObservation records while adding provenance, confidence, and dual-band fields.

ALTER TABLE "fire_observations"
  ALTER COLUMN "confidence" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "satellite_code" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence_raw" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence_category" TEXT,
  ADD COLUMN IF NOT EXISTS "brightness_temp_31" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "version" TEXT;

CREATE INDEX IF NOT EXISTS "fire_observations_confidence_category_idx"
  ON "fire_observations"("confidence_category");

CREATE INDEX IF NOT EXISTS "fire_observations_sensor_observation_time_idx"
  ON "fire_observations"("sensor", "observation_time");

