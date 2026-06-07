const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function createLoginRateLimiter({ windowMs = DEFAULT_WINDOW_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  const attempts = new Map();

  return (request, response, next) => {
    const now = Date.now();
    const username = normalizeUsername(request.body?.username);
    const ip = request.ip || request.socket?.remoteAddress || "unknown";
    const key = `${ip}:${username}`;
    const record = attempts.get(key);

    if (!record || record.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxAttempts) {
      response.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many login attempts. Try again later."
        }
      });
      return;
    }

    record.count += 1;
    next();
  };
}
