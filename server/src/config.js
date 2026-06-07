import "dotenv/config";
import { z } from "zod";

const DEVELOPMENT_AUTH_SECRET = "development-auth-secret-change-before-production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  AUTH_TOKEN_SECRET: z.string().min(32).default(DEVELOPMENT_AUTH_SECRET),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28800)
});

export function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    console.error(result.error.format());
    throw new Error("Invalid environment configuration");
  }

  if (result.data.NODE_ENV === "production" && result.data.AUTH_TOKEN_SECRET === DEVELOPMENT_AUTH_SECRET) {
    console.error("AUTH_TOKEN_SECRET must be set to a production secret");
    throw new Error("Invalid environment configuration");
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    corsOrigin: result.data.CORS_ORIGIN,
    logLevel: result.data.LOG_LEVEL,
    authTokenSecret: result.data.AUTH_TOKEN_SECRET,
    authSessionTtlSeconds: result.data.AUTH_SESSION_TTL_SECONDS
  };
}
