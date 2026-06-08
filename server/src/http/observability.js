function metricKey(...parts) {
  return parts.join(":");
}

export function createRequestLogger({ logger = console } = {}) {
  return (request, response, next) => {
    const startedAt = Date.now();

    response.on("finish", () => {
      logger.info?.({
        method: request.method,
        url: request.originalUrl || request.url,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        userId: request.auth?.userId
      }, "HTTP request completed");
    });

    next();
  };
}

export function createMetricsMiddleware() {
  const metrics = {
    requests_total: {},
    validation_failures_total: {},
    active_connections: 0
  };

  const middleware = (request, response, next) => {
    metrics.active_connections += 1;

    response.on("finish", () => {
      const key = metricKey(request.method, response.statusCode);
      metrics.requests_total[key] = (metrics.requests_total[key] || 0) + 1;
      metrics.active_connections = Math.max(metrics.active_connections - 1, 0);
    });

    next();
  };

  middleware.recordValidationFailure = (ruleCode = "UNKNOWN") => {
    metrics.validation_failures_total[ruleCode] = (metrics.validation_failures_total[ruleCode] || 0) + 1;
  };

  middleware.snapshot = () => ({
    requests_total: { ...metrics.requests_total },
    validation_failures_total: { ...metrics.validation_failures_total },
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
