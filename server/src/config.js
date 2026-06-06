import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    console.error(result.error.format());
    throw new Error("Invalid environment configuration");
  }
  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    corsOrigin: result.data.CORS_ORIGIN,
    logLevel: result.data.LOG_LEVEL
  };
}
