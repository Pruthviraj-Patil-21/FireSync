import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/firesync'),
  JWT_SECRET: z.string().min(8).default('firesync_jwt_operations_key_dev_token_secret_8492049'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  NASA_FIRMS_MAP_KEY: z.string().optional().default(''),
  FIRMS_API_BASE_URL: z.string().url().default('https://firms.modaps.eosdis.nasa.gov/api'),
  FIRMS_QUERY_MODE: z.enum(['country', 'area']).default('area'),
  FIRMS_COUNTRY_CODE: z.string().trim().min(2).max(10).default('IND'),
  FIRMS_AREA_BBOX: z.string().trim().default('68.0,6.5,97.5,37.5'),
  FIRMS_SOURCES: z.string().default('MODIS_NRT,VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT'),
  FIRMS_DAY_RANGE: z.coerce.number().int().min(1).max(10).default(1),
  FIRMS_DATE: z.string().trim().optional().default(''),
  FIRMS_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  INGESTION_CRON: z.string().default('*/15 * * * *'),
  LOG_LEVEL: z.string().default('info')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Environment configuration error');
}

export const env = parsed.data;

