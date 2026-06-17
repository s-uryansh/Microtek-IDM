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
  AGEING_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(43200000),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  SCAN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  SCAN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(240),
  // Number of trusted proxy hops in front of the app (or "true"/"false"). Used so
  // request.ip reflects the real client for IP-keyed rate limiting. Defaults to
  // "false" (no proxy trusted) to match prior behaviour.
  TRUST_PROXY: z.string().default("false"),
  IMPORT_WEBHOOK_SECRET: z.string().min(32).optional()
});

// Field metadata for startup environment reporting: which vars are required and
// which fall back to a default when absent. Keep in sync with envSchema above.
export const ENV_FIELDS = [
  { key: "NODE_ENV", default: "development" },
  { key: "PORT", default: 4000 },
  { key: "DATABASE_URL", required: true },
  { key: "CORS_ORIGIN", default: "http://localhost:5173" },
  { key: "LOG_LEVEL", default: "info" },
  { key: "AUTH_TOKEN_SECRET", default: "(development secret)" },
  { key: "AUTH_SESSION_TTL_SECONDS", default: 28800 },
  { key: "REDIS_URL", default: "redis://localhost:6379" },
  { key: "AGEING_REFRESH_INTERVAL_MS", default: 43200000 },
  { key: "API_RATE_LIMIT_WINDOW_MS", default: 60000 },
  { key: "API_RATE_LIMIT_MAX", default: 600 },
  { key: "SCAN_RATE_LIMIT_WINDOW_MS", default: 60000 },
  { key: "SCAN_RATE_LIMIT_MAX", default: 240 },
  { key: "TRUST_PROXY", default: "false" },
  { key: "IMPORT_WEBHOOK_SECRET", requiredInProduction: true }
];
