import { describe, expect, test } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  test("loads a valid Sprint 0 environment", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PORT: "4100",
      DATABASE_URL: "postgres://user:pass@localhost:5432/microtek_idm_test",
      CORS_ORIGIN: "http://localhost:5173",
      LOG_LEVEL: "silent"
    });

    expect(config).toEqual({
      nodeEnv: "test",
      port: 4100,
      databaseUrl: "postgres://user:pass@localhost:5432/microtek_idm_test",
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      authTokenSecret: "development-auth-secret-change-before-production",
      authSessionTtlSeconds: 28800,
      redisUrl: "redis://localhost:6379",
      trustProxy: false,
      ageingRefreshIntervalMs: 43200000,
      apiRateLimitWindowMs: 60000,
      apiRateLimitMax: 600,
      scanRateLimitWindowMs: 60000,
      scanRateLimitMax: 240,
      importWebhookSecret: undefined,
      sapSourceWarehouseCode: "PLNT-01"
    });
  });

  test("fails closed when DATABASE_URL is missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        PORT: "4100",
        CORS_ORIGIN: "http://localhost:5173",
        LOG_LEVEL: "silent"
      })
    ).toThrow("Invalid environment configuration");
  });

  test("rejects the development auth secret in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        PORT: "4100",
        DATABASE_URL: "postgres://user:pass@localhost:5432/microtek_idm_test",
        CORS_ORIGIN: "http://localhost:5173",
        LOG_LEVEL: "silent",
        AUTH_TOKEN_SECRET: "development-auth-secret-change-before-production"
      })
    ).toThrow("Invalid environment configuration");
  });

  const productionEnv = (overrides = {}) => ({
    NODE_ENV: "production",
    PORT: "4100",
    DATABASE_URL: "postgres://user:pass@localhost:5432/microtek_idm",
    CORS_ORIGIN: "https://idm.example.com",
    LOG_LEVEL: "silent",
    AUTH_TOKEN_SECRET: "a-production-grade-secret-value-001",
    REDIS_URL: "rediss://prod-redis:6379",
    IMPORT_WEBHOOK_SECRET: "a-production-grade-webhook-secret-1",
    ...overrides
  });

  test("requires IMPORT_WEBHOOK_SECRET in production", () => {
    const env = productionEnv();
    delete env.IMPORT_WEBHOOK_SECRET;

    expect(() => loadConfig(env)).toThrow("Invalid environment configuration");
  });

  test("accepts a production environment with the webhook secret set", () => {
    const config = loadConfig(productionEnv());

    expect(config.importWebhookSecret).toBe("a-production-grade-webhook-secret-1");
  });

  test("rejects a plaintext remote REDIS_URL in production", () => {
    expect(() => loadConfig(productionEnv({ REDIS_URL: "redis://prod-redis:6379" }))).toThrow(
      "Invalid environment configuration"
    );
  });

  test("allows a loopback plaintext REDIS_URL in production", () => {
    const config = loadConfig(productionEnv({ REDIS_URL: "redis://127.0.0.1:6379" }));
    expect(config.redisUrl).toBe("redis://127.0.0.1:6379");
  });

  test("parses TRUST_PROXY into a usable value", () => {
    expect(loadConfig(productionEnv({ TRUST_PROXY: "true" })).trustProxy).toBe(true);
    expect(loadConfig(productionEnv({ TRUST_PROXY: "2" })).trustProxy).toBe(2);
    expect(loadConfig(productionEnv()).trustProxy).toBe(false);
  });

  test("leaves IMPORT_WEBHOOK_SECRET optional outside production", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      PORT: "4000",
      DATABASE_URL: "postgres://user:pass@localhost:5432/microtek_idm",
      CORS_ORIGIN: "http://localhost:5173",
      LOG_LEVEL: "silent"
    });

    expect(config.importWebhookSecret).toBeUndefined();
  });
});
