import { randomUUID } from "node:crypto";

function metricKey(...parts) {
  return parts.join(":");
}

function statusClass(statusCode) {
  return `${Math.floor(Number(statusCode || 0) / 100)}xx`;
}

export function createRequestContext({ logger = console } = {}) {
  return (request, response, next) => {
    const requestId = request.get("x-request-id") || randomUUID();
    request.id = requestId;
    response.setHeader("x-request-id", requestId);
    request.log = typeof logger.child === "function" ? logger.child({ requestId }) : logger;
    next();
  };
}

export function createRequestLogger({ logger = console } = {}) {
  return (request, response, next) => {
    const startedAt = Date.now();

    response.on("finish", () => {
      const log = request.log ?? logger;
      log.info?.({
        event: "http_request_completed",
        requestId: request.id,
        method: request.method,
        url: request.originalUrl || request.url,
        statusCode: response.statusCode,
        statusClass: statusClass(response.statusCode),
        durationMs: Date.now() - startedAt,
        userId: request.auth?.userId,
        role: request.auth?.role,
        warehouseIds: request.auth?.warehouseIds
      }, "HTTP request completed");
    });

    next();
  };
}

export function createMetricsMiddleware() {
  const metrics = {
    requests_total: {},
    responses_total: {},
    request_duration_ms: {},
    validation_failures_total: {},
    auth_failures_total: {},
    abuse_events_total: {},
    errors_total: {},
    active_connections: 0
  };

  const middleware = (request, response, next) => {
    const startedAt = Date.now();
    metrics.active_connections += 1;

    response.on("finish", () => {
      const status = statusClass(response.statusCode);
      const key = metricKey(request.method, response.statusCode);
      const statusKey = metricKey(request.method, status);
      const routeKey = metricKey(request.method, request.route?.path || request.path || "unknown", status);
      const durationMs = Date.now() - startedAt;
      metrics.requests_total[key] = (metrics.requests_total[key] || 0) + 1;
      metrics.responses_total[statusKey] = (metrics.responses_total[statusKey] || 0) + 1;
      const duration = metrics.request_duration_ms[routeKey] ?? {
        count: 0,
        totalMs: 0,
        maxMs: 0
      };
      duration.count += 1;
      duration.totalMs += durationMs;
      duration.maxMs = Math.max(duration.maxMs, durationMs);
      metrics.request_duration_ms[routeKey] = duration;
      if (response.statusCode === 401 || response.statusCode === 403) {
        metrics.auth_failures_total[response.statusCode] = (metrics.auth_failures_total[response.statusCode] || 0) + 1;
      }
      if (response.statusCode >= 500) {
        metrics.errors_total[status] = (metrics.errors_total[status] || 0) + 1;
      }
      metrics.active_connections = Math.max(metrics.active_connections - 1, 0);
    });

    next();
  };

  middleware.recordValidationFailure = (ruleCode = "UNKNOWN") => {
    metrics.validation_failures_total[ruleCode] = (metrics.validation_failures_total[ruleCode] || 0) + 1;
  };

  middleware.recordAbuseEvent = (eventName = "UNKNOWN") => {
    metrics.abuse_events_total[eventName] = (metrics.abuse_events_total[eventName] || 0) + 1;
  };

  middleware.snapshot = () => ({
    requests_total: { ...metrics.requests_total },
    responses_total: { ...metrics.responses_total },
    request_duration_ms: { ...metrics.request_duration_ms },
    validation_failures_total: { ...metrics.validation_failures_total },
    auth_failures_total: { ...metrics.auth_failures_total },
    abuse_events_total: { ...metrics.abuse_events_total },
    errors_total: { ...metrics.errors_total },
    active_connections: metrics.active_connections
  });

  return middleware;
}

export function healthHandler(_request, response) {
  response.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
}
