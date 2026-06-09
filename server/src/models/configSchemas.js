import { z } from "zod";

export const DEVELOPMENT_AUTH_SECRET = "development-auth-secret-change-before-production";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  AUTH_TOKEN_SECRET: z.string().min(32).default(DEVELOPMENT_AUTH_SECRET),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28800),
  REDIS_URL: z.string().url().optional().default("redis://localhost:6379"),
  AGEING_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(3600000),
  IMPORT_WEBHOOK_SECRET: z.string().min(32).optional()
});
