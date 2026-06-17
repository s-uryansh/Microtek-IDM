import { describe, expect, test } from "vitest";

import { createSrnService } from "../src/idm04/srnService.js";
import { createBatteryPreBillingService } from "../src/idm03/batteryPreBillingService.js";
import { createDispatchService } from "../src/idm05/dispatchService.js";
import { createFulfilmentStatusService } from "../src/idm07/fulfilmentStatusService.js";

// ---------------------------------------------------------------------------
// #1 — cumulative SRN return cap (dispatched − already returned)
// ---------------------------------------------------------------------------

describe("SRN cumulative return cap", () => {
  function build({ returnable }) {
    const repositories = {
      srns: {
        async invoiceHasDispatchedSerials() {
          return true;
        },
        async countReturnableForInvoice() {
          return returnable;
        },
        async create(input) {
          return { srnId: 30, status: "PENDING", ...input };
        }
      }
    };
    return { repositories, conditionTagService: { isAllowed: () => true } };
  }

  test("rejects a declared quantity above what is still returnable (N dispatched, 1 returned → max N-1)", async () => {
    // 3 dispatched, 1 already returned → returnable = 2; declaring 3 must fail.
    const { repositories, conditionTagService } = build({ returnable: 2 });
    const service = createSrnService({ repositories, conditionTagService });

    await expect(
      service.createSrn({ receivingWarehouseId: 5, invoiceId: 10, returnProductIds: [], expectedQuantity: 3, userId: "op" })
    ).rejects.toMatchObject({ status: 409, code: "RETURN_QUANTITY_EXCEEDS_DISPATCHED", returnable: 2 });
  });

  test("accepts a declared quantity within what is still returnable", async () => {
    const { repositories, conditionTagService } = build({ returnable: 2 });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.createSrn({
      receivingWarehouseId: 5,
      invoiceId: 10,
      returnProductIds: [],
      expectedQuantity: 2,
      userId: "op"
    });

    expect(result).toMatchObject({ srnId: 30 });
  });
});

// ---------------------------------------------------------------------------
// #2 — battery pre-billing cannot exceed the invoice line quantity
// ---------------------------------------------------------------------------

describe("battery pre-billing quantity cap", () => {
  function build({ requiredQuantity, committedForLine }) {
    const repositories = {
      async withTransaction(work) {
        return work(repositories);
      },
      invoices: {
        async findById() {
          return { invoiceId: 1, lines: [] };
        }
      },
      validationService: {
        async validateSerial() {
          return { valid: true, serial: { serialId: 7, serialNo: "BAT-1", productId: 9, currentWarehouseId: 5 } };
        }
      },
      batteryPreBilling: {
        async findBatteryLine() {
          return { invoiceLineId: 100, productId: 9, requiredQuantity };
        },
        async findCommitBySerial() {
          return null;
        },
        async countCommitsForLine() {
          return committedForLine;
        },
        async insertCommit() {
          return { batteryPreBillingId: 1 };
        }
      },
      serials: { async appendSerialEvent() {} },
      exceptionsRepo: { async createException() {} }
    };
    return { repositories };
  }

  test("blocks a commit once the line quantity is reached", async () => {
    const { repositories } = build({ requiredQuantity: 2, committedForLine: 2 });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({ invoiceId: 1, serialNo: "BAT-1", userId: "op", userWarehouseIds: [5] });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("BATTERY_QUANTITY_REACHED");
  });

  test("allows a commit while under the line quantity", async () => {
    const { repositories } = build({ requiredQuantity: 2, committedForLine: 1 });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({ invoiceId: 1, serialNo: "BAT-1", userId: "op", userWarehouseIds: [5] });

    expect(result).toMatchObject({ valid: true, status: "COMMITTED" });
  });
});

// ---------------------------------------------------------------------------
// #3 — a battery pre-billed to invoice B cannot be dispatched on invoice A
// ---------------------------------------------------------------------------

describe("battery dispatch is scoped to the pre-billed invoice", () => {
  // The serial is pre-billed to invoice 2. Dispatching against `dispatchInvoiceId`
  // only finds the commit when it matches the invoice it was committed to.
  function build({ dispatchInvoiceId, committedInvoiceId }) {
    const calls = { createException: [] };
    const dispatch = {
      dispatchId: 10,
      invoiceId: dispatchInvoiceId,
      warehouseId: 5,
      targetQuantity: 5,
      status: "IN_PROGRESS",
      lines: [{ invoiceLineId: 1, productId: 9, quantity: 5, targetQuantity: null, isBattery: true }],
      scans: []
    };
    const repositories = {
      calls,
      async withTransaction(work) {
        return work(repositories);
      },
      validationService: {
        async validateSerial() {
          return { valid: true, serial: { serialId: 7, serialNo: "BAT-1", productId: 9, conditionTag: null, currentWarehouseId: 5 } };
        }
      },
      invoices: { async updateStatus() {} },
      dispatches: {
        async findById() { return dispatch; },
        async lockById() { return dispatch; },
        async countScans() { return 0; },
        async countScansForLine() { return 0; },
        async insertScan(input) { return { dispatchScanId: 1, ...input }; },
        async updateStatus() {}
      },
      serials: {
        async updateStatusIfCurrent() { return true; },
        async appendSerialEvent() {}
      },
      batteryPreBilling: {
        async findCommitForInvoice(serialId, invoiceId) {
          return String(invoiceId) === String(committedInvoiceId) ? { batteryPreBillingId: 1, serialId } : null;
        }
      },
      exceptionsRepo: {
        async createException(input) {
          calls.createException.push(input);
          return { exceptionId: calls.createException.length, ruleCode: input.ruleCode, status: "OPEN" };
        }
      }
    };
    return repositories;
  }

  test("blocks dispatch on invoice A when the battery was pre-billed to invoice B", async () => {
    const repositories = build({ dispatchInvoiceId: 1, committedInvoiceId: 2 });
    const service = createDispatchService({ repositories, fulfilmentStatusService: createFulfilmentStatusService() });

    const result = await service.scanSerial({ dispatchId: 10, serialNo: "BAT-1", userId: "op" });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("BATTERY_NOT_PREBILLED");
  });

  test("allows dispatch when the battery was pre-billed to the same invoice", async () => {
    const repositories = build({ dispatchInvoiceId: 1, committedInvoiceId: 1 });
    const service = createDispatchService({ repositories, fulfilmentStatusService: createFulfilmentStatusService() });

    const result = await service.scanSerial({ dispatchId: 10, serialNo: "BAT-1", userId: "op" });

    expect(result.valid).toBe(true);
  });
});
