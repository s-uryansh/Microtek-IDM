import "dotenv/config";
import { DEVELOPMENT_AUTH_SECRET, ENV_FIELDS, envSchema } from "./models/configSchemas.js";

function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

// Report the environment to the terminal at startup: warn (don't fail) for any
// optional var that fell back to its default, and clearly name any required var
// that is missing. Driven by ENV_FIELDS, not by reading the .env file.
function reportEnvironment(env) {
  if (env.NODE_ENV === "test") {
    return; // keep test output clean
  }

  for (const field of ENV_FIELDS) {
    if (isPresent(env[field.key])) {
      continue;
    }
    if (field.required) {
      console.error(`[env] MISSING required variable: ${field.key}`);
    } else if (field.requiredInProduction && env.NODE_ENV === "production") {
      console.error(`[env] MISSING required-in-production variable: ${field.key}`);
    } else if (field.default !== undefined) {
      console.warn(`[env] ${field.key} not present in env — using default (${field.default})`);
    } else {
      console.warn(`[env] ${field.key} not present in env`);
    }
  }
}

function parseTrustProxy(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // pass through subnet/list strings to express
}

function isSecureRedisUrl(url) {
  if (/^rediss:\/\//i.test(url)) return true; // TLS
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function loadConfig(env = process.env) {
  reportEnvironment(env);

  const result = envSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    console.error(`Invalid environment configuration:\n${details}`);
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

  if (result.data.NODE_ENV === "production" && env.REDIS_URL && !isSecureRedisUrl(result.data.REDIS_URL)) {
    // A remote Redis must use TLS (rediss://); only loopback may be plaintext.
    console.error("REDIS_URL must use rediss:// (TLS) or be a loopback address in production");
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
    trustProxy: parseTrustProxy(result.data.TRUST_PROXY),
    ageingRefreshIntervalMs: result.data.AGEING_REFRESH_INTERVAL_MS,
    apiRateLimitWindowMs: result.data.API_RATE_LIMIT_WINDOW_MS,
    apiRateLimitMax: result.data.API_RATE_LIMIT_MAX,
    scanRateLimitWindowMs: result.data.SCAN_RATE_LIMIT_WINDOW_MS,
    scanRateLimitMax: result.data.SCAN_RATE_LIMIT_MAX,
    importWebhookSecret: result.data.IMPORT_WEBHOOK_SECRET
  };
}
