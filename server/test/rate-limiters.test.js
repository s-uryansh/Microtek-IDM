import { describe, expect, test } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";

const baseConfig = {
  nodeEnv: "test",
  port: 4100,
  databaseUrl: "postgres://user:pass@localhost:5432/microtek_idm_test",
  corsOrigin: "http://localhost:5173",
  logLevel: "silent"
};

describe("rate limiting", () => {
  test("returns 429 with RATE_LIMITED once the global API limit is exceeded", async () => {
    const app = createApp({ config: { ...baseConfig, apiRateLimitMax: 2, apiRateLimitWindowMs: 60000 } });

    // The limiter sits ahead of auth, so unauthenticated 401s still count against the budget.
    await request(app).get("/api/metrics");
    await request(app).get("/api/metrics");
    const limited = await request(app).get("/api/metrics");

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(app.locals.metrics.snapshot().abuse_events_total.global_api).toBeGreaterThanOrEqual(1);
  });

  test("exposes standard RateLimit headers", async () => {
    const app = createApp({ config: { ...baseConfig, apiRateLimitMax: 5 } });
    const response = await request(app).get("/api/metrics");

    expect(response.headers.ratelimit ?? response.headers["ratelimit-limit"]).toBeDefined();
  });

  test("echoes an inbound x-request-id for correlation", async () => {
    const app = createApp({ config: baseConfig });
    const response = await request(app).get("/health").set("x-request-id", "test-correlation-1");

    expect(response.headers["x-request-id"]).toBe("test-correlation-1");
  });

  test("generates an x-request-id when the client does not supply one", async () => {
    const app = createApp({ config: baseConfig });
    const response = await request(app).get("/health");

    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});
