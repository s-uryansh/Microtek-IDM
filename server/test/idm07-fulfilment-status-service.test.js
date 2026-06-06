import { describe, expect, test } from "vitest";

import { createFulfilmentStatusService } from "../src/idm07/fulfilmentStatusService.js";

describe("IDM-07 fulfilment status service", () => {
  const service = createFulfilmentStatusService();

  test("returns PENDING when no serials are scanned", () => {
    expect(
      service.calculateStatus({
        requiredQuantity: 3,
        scannedQuantity: 0
      })
    ).toBe("PENDING");
  });

  test("returns IN_PROGRESS when some but not all serials are scanned", () => {
    expect(
      service.calculateStatus({
        requiredQuantity: 3,
        scannedQuantity: 2
      })
    ).toBe("IN_PROGRESS");
  });

  test("returns DISPATCHED only when all invoice quantities are scanned", () => {
    expect(
      service.calculateStatus({
        requiredQuantity: 3,
        scannedQuantity: 3
      })
    ).toBe("DISPATCHED");
  });

  test("keeps incomplete completion blocked unless business rules explicitly allow it", () => {
    expect(
      service.canCompleteDispatch({
        requiredQuantity: 3,
        scannedQuantity: 2
      })
    ).toEqual({
      allowed: false,
      status: "IN_PROGRESS",
      reason: "INCOMPLETE_DISPATCH"
    });
  });
});
