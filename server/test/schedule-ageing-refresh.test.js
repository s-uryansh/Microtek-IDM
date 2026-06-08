import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { startAgeingRefreshSchedule } from "../src/db/scheduleAgeingRefresh.js";

function createLogger() {
  return { info: vi.fn(), error: vi.fn() };
}

describe("startAgeingRefreshSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("logs that the schedule has started and does not refresh immediately", () => {
    const logger = createLogger();
    const pool = { query: vi.fn().mockResolvedValue() };

    const handle = startAgeingRefreshSchedule({ pool, logger, intervalMs: 1000 });

    expect(logger.info).toHaveBeenCalledWith({ intervalMs: 1000 }, expect.stringMatching(/started/));
    expect(pool.query).not.toHaveBeenCalled();
    handle.stop();
  });

  test("refreshes the materialized view concurrently on each interval", async () => {
    const logger = createLogger();
    const pool = { query: vi.fn().mockResolvedValue() };

    const handle = startAgeingRefreshSchedule({ pool, logger, intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(pool.query).toHaveBeenCalledWith(
      "REFRESH MATERIALIZED VIEW CONCURRENTLY ageing_serial_snapshot"
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: expect.any(Number) }),
      expect.stringMatching(/refreshed/)
    );
    handle.stop();
  });

  test("logs and swallows refresh errors without throwing", async () => {
    const logger = createLogger();
    const pool = { query: vi.fn().mockRejectedValue(new Error("lock timeout")) };

    const handle = startAgeingRefreshSchedule({ pool, logger, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      expect.stringMatching(/failed/)
    );
    handle.stop();
  });

  test("stop() prevents further refreshes", async () => {
    const logger = createLogger();
    const pool = { query: vi.fn().mockResolvedValue() };

    const handle = startAgeingRefreshSchedule({ pool, logger, intervalMs: 1000 });
    handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
