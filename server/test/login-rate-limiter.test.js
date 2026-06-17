import { describe, expect, test } from "vitest";

import { createLoginRateLimiter } from "../src/auth/loginRateLimiter.js";

const silentLogger = { warn() {}, error() {} };

function makeLimiter(redisClient, overrides = {}) {
  // Passing a redisClient forces the real (non-test) code path even under NODE_ENV=test.
  return createLoginRateLimiter({
    redisClient,
    windowMs: 60000,
    maxAttempts: 2,
    nodeEnv: "production",
    logger: silentLogger,
    ...overrides
  });
}

describe("login rate limiter", () => {
  test("counts attempts via Redis and blocks past the limit", async () => {
    let n = 0;
    const redis = { on() {}, async incr() { n += 1; return n; }, async expire() {}, async del() {} };
    const limiter = makeLimiter(redis);

    expect((await limiter.check("ip")).allowed).toBe(true);
    expect((await limiter.check("ip")).allowed).toBe(true);
    expect((await limiter.check("ip")).allowed).toBe(false);
  });

  test("falls back to an in-process counter when Redis is unavailable (no throw, still limits)", async () => {
    const redis = {
      on() {},
      async incr() { throw new Error("redis down"); },
      async expire() {},
      async del() {}
    };
    const limiter = makeLimiter(redis);

    // Must not throw, and must still enforce the limit via the fallback counter.
    expect((await limiter.check("ip")).allowed).toBe(true);
    expect((await limiter.check("ip")).allowed).toBe(true);
    expect((await limiter.check("ip")).allowed).toBe(false);
  });
});
