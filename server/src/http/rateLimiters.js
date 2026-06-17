import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { sendError } from "./errorResponse.js";

function keyForRequest(request) {
  if (request.auth?.userId) {
    return `user:${request.auth.userId}`;
  }
  return `ip:${ipKeyGenerator(request.ip || request.socket?.remoteAddress || "unknown")}`;
}

function createLimiter({ windowMs, max, code, message, metricsName }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: keyForRequest,
    handler(request, response) {
      request.app?.locals?.metrics?.recordAbuseEvent?.(metricsName);
      request.log?.warn?.({
        event: "rate_limit_exceeded",
        limiter: metricsName,
        userId: request.auth?.userId,
        warehouseIds: request.auth?.warehouseIds
      }, message);
      sendError(response, 429, code, message);
    }
  });
}

export function createGlobalApiLimiter(config) {
  return createLimiter({
    windowMs: config.apiRateLimitWindowMs ?? 60000,
    max: config.apiRateLimitMax ?? 600,
    code: "RATE_LIMITED",
    message: "Too many API requests. Try again later.",
    metricsName: "global_api"
  });
}

export function createScanApiLimiter(config) {
  return createLimiter({
    windowMs: config.scanRateLimitWindowMs ?? 60000,
    max: config.scanRateLimitMax ?? 240,
    code: "SCAN_RATE_LIMITED",
    message: "Too many scan requests. Pause briefly and try again.",
    metricsName: "scan_api"
  });
}
