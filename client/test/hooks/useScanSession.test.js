import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useScanSession } from "../../src/hooks/useScanSession.js";

describe("useScanSession duplicate handling", () => {
  test("a rejected serial can be re-scanned after the cause is corrected", async () => {
    // First attempt is rejected by business rules; once corrected, the same
    // serial must reach onScan again instead of being blocked as a duplicate.
    const onScan = vi
      .fn()
      .mockResolvedValueOnce({ status: "WRONG_WAREHOUSE", message: "nope", state: "error" })
      .mockResolvedValueOnce({ status: "ACCEPTED", message: "ok", state: "success" });

    const { result } = renderHook(() => useScanSession({ module: "GRN", onScan }));

    await act(async () => {
      await result.current.submitScan("MTK1234567890");
    });
    await act(async () => {
      await result.current.submitScan("MTK1234567890");
    });

    expect(onScan).toHaveBeenCalledTimes(2);
    expect(result.current.scans[0]).toMatchObject({ status: "ACCEPTED", state: "success" });
  });

  test("an accepted serial is still deduplicated on re-scan", async () => {
    const onScan = vi.fn().mockResolvedValue({ status: "ACCEPTED", message: "ok", state: "success" });
    const { result } = renderHook(() => useScanSession({ module: "GRN", onScan }));

    await act(async () => {
      await result.current.submitScan("MTK1234567890");
    });
    await act(async () => {
      await result.current.submitScan("MTK1234567890");
    });

    // Second call is short-circuited by client dedup; onScan only runs once.
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(result.current.scans[0]).toMatchObject({ status: "DUPLICATE_SCAN", state: "warning" });
  });
});
