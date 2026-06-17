import { describe, expect, test } from "vitest";

import { createSrnService } from "../src/idm04/srnService.js";
import { createDispatchService } from "../src/idm05/dispatchService.js";
import { createFulfilmentStatusService } from "../src/idm07/fulfilmentStatusService.js";
import { createConditionCorrectionService } from "../src/idm04/conditionCorrectionService.js";

// ---------------------------------------------------------------------------
// Finding 1 — defective/repair returns are held off dispatch
// ---------------------------------------------------------------------------

describe("dispatch condition hold (Finding 1)", () => {
  function buildDispatchRepositories({ conditionTag }) {
    const calls = { createException: [], updateSerial: [] };
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      targetQuantity: 5,
      status: "IN_PROGRESS",
      lines: [{ invoiceLineId: 1, productId: 7, quantity: 5, targetQuantity: null, isBattery: false }],
      scans: []
    };
    const repositories = {
      calls,
      async withTransaction(work) {
        return work(repositories);
      },
      validationService: {
        async validateSerial() {
          return {
            valid: true,
            serial: { serialId: 7, serialNo: "MTK1234567890", productId: 7, conditionTag, currentWarehouseId: 5 }
          };
        }
      },
      invoices: { async updateStatus() {} },
      dispatches: {
        async findById() {
          return dispatch;
        },
        async lockById() {
          return dispatch;
        },
        async countScans() {
          return 0;
        },
        async countScansForLine() {
          return 0;
        },
        async insertScan(input) {
          return { dispatchScanId: 1, ...input };
        },
        async updateStatus() {}
      },
      serials: {
        async updateStatusIfCurrent(serialId, expected, status, by) {
          calls.updateSerial.push({ serialId, expected, status, by });
          return true;
        },
        async appendSerialEvent() {}
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

  test.each(["DEFECTIVE", "REPAIR"])("blocks a %s serial from dispatch and logs CONDITION_HOLD", async (tag) => {
    const repositories = buildDispatchRepositories({ conditionTag: tag });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.scanSerial({ dispatchId: 10, serialNo: "MTK1234567890", userId: "op_1" });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("CONDITION_HOLD");
    expect(repositories.calls.createException).toEqual([
      expect.objectContaining({ ruleCode: "CONDITION_HOLD", contextType: "DISPATCH" })
    ]);
    // The serial must never flip to DISPATCHED while on hold.
    expect(repositories.calls.updateSerial).toHaveLength(0);
  });

  test("allows a SALEABLE serial through the condition gate", async () => {
    const repositories = buildDispatchRepositories({ conditionTag: "SALEABLE" });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.scanSerial({ dispatchId: 10, serialNo: "MTK1234567890", userId: "op_1" });

    expect(result.valid).toBe(true);
    expect(repositories.calls.createException).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Finding 1 — condition correction (retag) service
// ---------------------------------------------------------------------------

describe("condition correction service (Finding 1)", () => {
  function build({ serial }) {
    const calls = { setConditionTag: [], appendEvent: [] };
    const repositories = {
      calls,
      async withTransaction(work) {
        return work(repositories);
      },
      serials: {
        async findBySerialNo(serialNo) {
          return serial?.serialNo === serialNo ? serial : null;
        },
        async setConditionTag(serialId, conditionTag, updatedBy) {
          calls.setConditionTag.push({ serialId, conditionTag, updatedBy });
        },
        async appendSerialEvent(event) {
          calls.appendEvent.push(event);
        },
        async findHeldStock() {
          return [{ serialId: 7, serialNo: "MTK1234567890", conditionTag: "DEFECTIVE" }];
        }
      }
    };
    const conditionTagService = { isAllowed: (tag) => ["SALEABLE", "DEFECTIVE", "REPAIR"].includes(tag) };
    return { repositories, conditionTagService };
  }

  test("retags a held serial SALEABLE and records a CORRECTION event", async () => {
    const { repositories, conditionTagService } = build({
      serial: { serialId: 7, serialNo: "MTK1234567890", currentWarehouseId: 5, conditionTag: "DEFECTIVE" }
    });
    const service = createConditionCorrectionService({ repositories, conditionTagService });

    const result = await service.correctConditionTag({
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "supervisor_1"
    });

    expect(result.ok).toBe(true);
    expect(repositories.calls.setConditionTag).toEqual([
      { serialId: 7, conditionTag: "SALEABLE", updatedBy: "supervisor_1" }
    ]);
    expect(repositories.calls.appendEvent[0]).toMatchObject({ eventType: "CORRECTION", referenceType: "CONDITION" });
  });

  test("rejects an unknown serial", async () => {
    const { repositories, conditionTagService } = build({ serial: null });
    const service = createConditionCorrectionService({ repositories, conditionTagService });

    const result = await service.correctConditionTag({ serialNo: "MISSING", conditionTag: "SALEABLE", userId: "s" });

    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  test("rejects an invalid condition tag", async () => {
    const { repositories, conditionTagService } = build({
      serial: { serialId: 7, serialNo: "MTK1234567890", currentWarehouseId: 5 }
    });
    const service = createConditionCorrectionService({ repositories, conditionTagService });

    const result = await service.correctConditionTag({ serialNo: "MTK1234567890", conditionTag: "JUNK", userId: "s" });

    expect(result).toMatchObject({ ok: false, code: "INVALID_CONDITION_TAG" });
  });
});

// ---------------------------------------------------------------------------
// Finding 2 — partial dispatch status + SRN re-open
// ---------------------------------------------------------------------------

describe("invoice partial status (Finding 2)", () => {
  test("reports PARTIALLY_DISPATCHED when some but not all units are scanned", () => {
    const service = createFulfilmentStatusService();
    expect(service.calculateInvoiceStatus({ requiredQuantity: 4, scannedQuantity: 2 })).toBe("PARTIALLY_DISPATCHED");
    expect(service.calculateInvoiceStatus({ requiredQuantity: 4, scannedQuantity: 0 })).toBe("PENDING");
    expect(service.calculateInvoiceStatus({ requiredQuantity: 4, scannedQuantity: 4 })).toBe("DISPATCHED");
  });

  test("dispatch-row status stays IN_PROGRESS (unchanged)", () => {
    const service = createFulfilmentStatusService();
    expect(service.calculateStatus({ requiredQuantity: 4, scannedQuantity: 2 })).toBe("IN_PROGRESS");
  });
});

describe("SRN declared quantity guard", () => {
  function build({ expectedQuantity, alreadyScanned }) {
    const repositories = {
      async withTransaction(work) {
        return work(repositories);
      },
      srns: {
        async findById() {
          return { srnId: 20, receivingWarehouseId: 5, invoiceId: 10, expectedQuantity };
        },
        async lockById() {
          return { srnId: 20, receivingWarehouseId: 5, invoiceId: 10, expectedQuantity };
        },
        async countScans() {
          return alreadyScanned;
        },
        async findOriginalDispatchScan() {
          return { dispatchScanId: 1, serialId: 7, invoiceId: 10 };
        },
        async hasReturnedSerial() {
          return false;
        },
        async insertScan(input) {
          return { srnScanId: 1, ...input };
        }
      },
      serials: { async updateReceipt() {}, async setConditionTag() {}, async appendSerialEvent() {} },
      dispatches: { async markScanReturned() { return true; }, async countScansForInvoice() { return 0; } },
      invoices: { async findById() { return { invoiceId: 10, lines: [{ quantity: 4 }] }; }, async updateStatus() {} },
      exceptionsRepo: { async createException(i) { return { exceptionId: 1, ruleCode: i.ruleCode, status: "OPEN" }; } },
      validationService: {
        async validateSerial() {
          return { valid: true, serial: { serialId: 7, serialNo: "MTK1234567890", productId: 7 } };
        }
      }
    };
    return { repositories, conditionTagService: { isAllowed: () => true } };
  }

  test("blocks a scan once the declared quantity is reached", async () => {
    const { repositories, conditionTagService } = build({ expectedQuantity: 1, alreadyScanned: 1 });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("SRN_QUANTITY_REACHED");
  });

  test("allows a scan while under the declared quantity", async () => {
    const { repositories, conditionTagService } = build({ expectedQuantity: 2, alreadyScanned: 1 });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
  });
});

describe("SRN re-opens the invoice (Finding 2)", () => {
  function build() {
    const calls = { markScanReturned: [], setConditionTag: [], updateInvoiceStatus: [] };
    let scannedForInvoice = 4; // fully dispatched (required = 4)
    const repositories = {
      calls,
      async withTransaction(work) {
        return work(repositories);
      },
      srns: {
        async findById() {
          return { srnId: 20, receivingWarehouseId: 5, invoiceId: 10 };
        },
        async lockById() {
          return { srnId: 20, receivingWarehouseId: 5, invoiceId: 10 };
        },
        async findOriginalDispatchScan() {
          return { dispatchScanId: 1, serialId: 7, invoiceId: 10 };
        },
        async hasReturnedSerial() {
          return false;
        },
        async insertScan(input) {
          return { srnScanId: 1, ...input };
        }
      },
      serials: {
        async updateReceipt() {},
        async setConditionTag(serialId, conditionTag, by) {
          calls.setConditionTag.push({ serialId, conditionTag, by });
        },
        async appendSerialEvent() {}
      },
      dispatches: {
        async markScanReturned(dispatchScanId, by) {
          calls.markScanReturned.push({ dispatchScanId, by });
          scannedForInvoice -= 1;
          return true;
        },
        async countScansForInvoice() {
          return scannedForInvoice;
        }
      },
      invoices: {
        async findById() {
          return { invoiceId: 10, lines: [{ quantity: 4 }] };
        },
        async updateStatus(invoiceId, status) {
          calls.updateInvoiceStatus.push({ invoiceId, status });
        }
      },
      exceptionsRepo: {
        async createException(input) {
          return { exceptionId: 1, ruleCode: input.ruleCode, status: "OPEN" };
        }
      },
      validationService: {
        async validateSerial() {
          return { valid: true, serial: { serialId: 7, serialNo: "MTK1234567890", productId: 7 } };
        }
      }
    };
    const conditionTagService = { isAllowed: () => true };
    return { repositories, conditionTagService };
  }

  test("tags the serial, soft-returns the original scan, and re-opens the invoice", async () => {
    const { repositories, conditionTagService } = build();
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "DEFECTIVE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
    expect(repositories.calls.setConditionTag).toEqual([{ serialId: 7, conditionTag: "DEFECTIVE", by: "operator_1" }]);
    expect(repositories.calls.markScanReturned).toEqual([{ dispatchScanId: 1, by: "operator_1" }]);
    // required 4, now 3 scanned → invoice re-opened as PARTIALLY_DISPATCHED.
    expect(repositories.calls.updateInvoiceStatus).toEqual([{ invoiceId: 10, status: "PARTIALLY_DISPATCHED" }]);
  });
});
