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
      logLevel: "silent"
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
});
