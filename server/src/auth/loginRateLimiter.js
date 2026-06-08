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
  nodeEnv = process.env.NODE_ENV
} = {}) {
  if (nodeEnv === "test" && !redisClient) {
    return createTestLimiter({ windowMs, maxAttempts });
  }

  const redis = redisClient ?? new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });
  const windowSeconds = Math.ceil(windowMs / 1000);

  return {
    async check(ipAddress) {
      const key = keyForIp(ipAddress);
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      return {
        allowed: count <= maxAttempts,
        remaining: Math.max(maxAttempts - count, 0)
      };
    },

    async reset(ipAddress) {
      await redis.del(keyForIp(ipAddress));
    }
  };
}
