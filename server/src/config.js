import "dotenv/config";
import { DEVELOPMENT_AUTH_SECRET, envSchema } from "./models/configSchemas.js";

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

  if (result.data.NODE_ENV === "production" && !env.REDIS_URL) {
    console.error("REDIS_URL must be set in production");
    throw new Error("Invalid environment configuration");
  }

  if (result.data.NODE_ENV === "production" && !result.data.IMPORT_WEBHOOK_SECRET) {
    // Without a secret the import webhook signature check silently passes
    // (see webhookVerifier), so it must be present in production.
    console.error("IMPORT_WEBHOOK_SECRET must be set in production");
    throw new Error("Invalid environment configuration");
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    corsOrigin: result.data.CORS_ORIGIN,
    logLevel: result.data.LOG_LEVEL,
    authTokenSecret: result.data.AUTH_TOKEN_SECRET,
    authSessionTtlSeconds: result.data.AUTH_SESSION_TTL_SECONDS,
    redisUrl: result.data.REDIS_URL,
    ageingRefreshIntervalMs: result.data.AGEING_REFRESH_INTERVAL_MS,
    importWebhookSecret: result.data.IMPORT_WEBHOOK_SECRET
  };
}
