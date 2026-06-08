const DEFAULT_INTERVAL_MS = 3600000;

async function refreshAgeingSnapshot({ pool, logger }) {
  const startedAt = Date.now();

  try {
    await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY ageing_serial_snapshot");
    logger.info?.({ durationMs: Date.now() - startedAt }, "Ageing snapshot refreshed");
  } catch (error) {
    logger.error?.({ error, durationMs: Date.now() - startedAt }, "Ageing snapshot refresh failed");
  }
}

export function startAgeingRefreshSchedule({ pool, logger = console, intervalMs = DEFAULT_INTERVAL_MS }) {
  logger.info?.({ intervalMs }, "Ageing snapshot refresh schedule started");

  const timer = setInterval(() => {
    refreshAgeingSnapshot({ pool, logger });
  }, intervalMs);

  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
    }
  };
}
