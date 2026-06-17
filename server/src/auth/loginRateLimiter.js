import Redis from "ioredis";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

function keyForIp(ipAddress) {
  return `login_attempts:${String(ipAddress || "unknown")}`;
}

function createTestLimiter({ windowMs, maxAttempts }) {
  const attempts = new Map();

  return {
    async check(ipAddress) {
      const now = Date.now();
      const key = keyForIp(ipAddress);
      const record = attempts.get(key);

      if (!record || record.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxAttempts - 1 };
      }

      record.count += 1;
      return {
        allowed: record.count <= maxAttempts,
        remaining: Math.max(maxAttempts - record.count, 0)
      };
    },

    async reset(ipAddress) {
      attempts.delete(keyForIp(ipAddress));
    }
  };
}

export function createLoginRateLimiter({
  redisUrl = "redis://localhost:6379",
  windowMs = DEFAULT_WINDOW_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  redisClient,
  nodeEnv = process.env.NODE_ENV,
  logger = console
} = {}) {
  if (nodeEnv === "test" && !redisClient) {
    return createTestLimiter({ windowMs, maxAttempts });
  }

  const redis = redisClient ?? new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  // Surface connection problems instead of letting them bubble as unhandled
  // rejections. Never log the URL/credentials — just the error message.
  redis.on?.("error", (error) => {
    logger?.warn?.({ event: "redis_error", message: error?.message }, "Redis connection error");
  });

  // If Redis is unreachable we must not 500 every login (DoS) nor stop limiting
  // (brute-force). Fall back to an in-process counter so protection degrades
  // gracefully and stays closed.
  const fallback = createTestLimiter({ windowMs, maxAttempts });
  const windowSeconds = Math.ceil(windowMs / 1000);

  return {
    async check(ipAddress) {
      const key = keyForIp(ipAddress);

      try {
        const count = await redis.incr(key);

        if (count === 1) {
          await redis.expire(key, windowSeconds);
        }

        return {
          allowed: count <= maxAttempts,
          remaining: Math.max(maxAttempts - count, 0)
        };
      } catch (error) {
        logger?.warn?.(
          { event: "rate_limit_store_unavailable", message: error?.message },
          "Login rate-limit store unavailable; using in-process fallback"
        );
        return fallback.check(ipAddress);
      }
    },

    async reset(ipAddress) {
      try {
        await redis.del(keyForIp(ipAddress));
      } catch {
        // best effort — the fallback counter is reset below
      }
      await fallback.reset(ipAddress);
    }
  };
}
