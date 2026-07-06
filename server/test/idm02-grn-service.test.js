import { describe, expect, test } from "vitest";

import { createGrnService } from "../src/idm02/grnService.js";

function createRepositories({ grn, expectedLine, otherDispatchLine = null, existingScan = null, validationResult }) {
  const calls = {
    transaction: [],
    createGrn: [],
    insertScan: [],
    updateSerialReceipt: [],
    appendEvent: [],
    createException: [],
    markShort: []
  };
  const repositories = {
    calls,
    async withTransaction(work) {
      calls.transaction.push("begin");
      const result = await work(repositories);
      calls.transaction.push("commit");
      return result;
    },
    grns: {
      async create(input) {
        calls.createGrn.push(input);
        return { grnId: 10, status: "PENDING", ...input };
      },
      async findById(grnId) {
        return grn?.grnId === grnId ? grn : null;
      },
      async lockById(grnId) {
        return grn?.grnId === grnId ? grn : null;
      },
      async findExpectedLine(_grnId, serialId) {
        return expectedLine?.serialId === serialId ? expectedLine : null;
      },
      async findSerialInOtherDispatch(_grnId, serialId) {
        return otherDispatchLine?.serialId === serialId ? otherDispatchLine : null;
      },
      async findScanBySerial(_grnId, serialId) {
        return existingScan?.serialId === serialId ? existingScan : null;
      },
      async insertScan(input) {
        calls.insertScan.push(input);
        return { grnScanId: calls.insertScan.length, ...input };
      },
      async updateStatus() {},
      async summarize() {
        return { scannedCount: 1, matchedCount: 1, exceptionCount: 0 };
      }
    },
    serials: {
      async updateReceipt(serialId, warehouseId, receivedBy) {
        calls.updateSerialReceipt.push({ serialId, warehouseId, receivedBy });
      },
      async appendSerialEvent(event) {
        calls.appendEvent.push(event);
      }
    },
    exceptionsRepo: {
      async createException(input) {
        calls.createException.push(input);
        return { exceptionId: calls.createException.length, ruleCode: input.ruleCode, status: "OPEN" };
      }
    },
    validationService: {
      async validateSerial() {
        return validationResult;
      }
    }
  };

  return repositories;
}

describe("IDM-02 GRN service", () => {
  test("T02-01 receives a matched serial and writes a GRN event", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "PENDING" },
      expectedLine: { serialId: 7, destinationWarehouseId: 5 },
      validationResult: {
        valid: true,
        serial: { serialId: 7, serialNo: "MTK1234567890", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 10, serialNo: "MTK1234567890", userId: "operator_1" });

    expect(result.matchStatus).toBe("MATCHED");
    expect(repositories.calls.updateSerialReceipt).toEqual([{ serialId: 7, warehouseId: 5, receivedBy: "operator_1" }]);
    expect(repositories.calls.appendEvent[0]).toMatchObject({ eventType: "GRN", referenceType: "GRN", referenceId: 10 });
  });

  test("T02-03 flags excess serials", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "PENDING" },
      expectedLine: null,
      validationResult: {
        valid: true,
        serial: { serialId: 8, serialNo: "MTK1234567891", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 10, serialNo: "MTK1234567891", userId: "operator_1" });

    expect(result.valid).toBe(false);
    expect(result.matchStatus).toBe("EXCESS");
    expect(repositories.calls.createException[0]).toMatchObject({ ruleCode: "EXCESS", contextType: "GRN" });
  });

  test("T02-04 flags serials expected for another destination as wrong serial", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "PENDING" },
      expectedLine: null,
      otherDispatchLine: { serialId: 8, destinationWarehouseId: 6 },
      validationResult: {
        valid: true,
        serial: { serialId: 8, serialNo: "MTK1234567891", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 10, serialNo: "MTK1234567891", userId: "operator_1" });

    expect(result.valid).toBe(false);
    expect(result.matchStatus).toBe("WRONG_SERIAL");
    expect(repositories.calls.createException[0]).toMatchObject({ ruleCode: "WRONG_SERIAL", contextType: "GRN" });
    expect(repositories.calls.updateSerialReceipt).toHaveLength(0);
  });

  test("T02-05 blocks a misdirected serial whose dispatch destination is a different warehouse", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "PENDING" },
      expectedLine: { serialId: 7, destinationWarehouseId: 6 },
      validationResult: {
        valid: true,
        serial: { serialId: 7, serialNo: "MTK1234567890", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 10, serialNo: "MTK1234567890", userId: "operator_1" });

    expect(result.valid).toBe(false);
    expect(result.matchStatus).toBe("WRONG_WAREHOUSE");
    expect(repositories.calls.createException[0]).toMatchObject({ ruleCode: "WRONG_WAREHOUSE", contextType: "GRN" });
    expect(repositories.calls.updateSerialReceipt).toHaveLength(0);
    expect(repositories.calls.appendEvent).toHaveLength(0);
  });

  test("T02-06 blocks duplicate scans", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "IN_PROGRESS" },
      expectedLine: { serialId: 7 },
      existingScan: { serialId: 7 },
      validationResult: {
        valid: true,
        serial: { serialId: 7, serialNo: "MTK1234567890", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 10, serialNo: "MTK1234567890", userId: "operator_1" });

    expect(result.matchStatus).toBe("DUPLICATE_SCAN");
    expect(repositories.calls.appendEvent).toHaveLength(0);
  });

  test("T02-07 blocks a cross-session duplicate when the serial is already IN_STOCK", async () => {
    // A new GRN is started per session, so findScanBySerial (scoped to this grnId)
    // cannot see the earlier receipt. The serial's IN_STOCK status is the signal.
    const repositories = createRepositories({
      grn: { grnId: 11, receivingWarehouseId: 5, status: "PENDING" },
      expectedLine: { serialId: 7, destinationWarehouseId: 5 },
      validationResult: {
        valid: true,
        serial: { serialId: 7, serialNo: "MTK1234567890", currentStatus: "IN_STOCK", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 11, serialNo: "MTK1234567890", userId: "operator_1" });

    expect(result.matchStatus).toBe("DUPLICATE_SCAN");
    // Fast path bails out before the transaction: no scan, no receipt, no event.
    expect(repositories.calls.transaction).toHaveLength(0);
    expect(repositories.calls.insertScan).toHaveLength(0);
    expect(repositories.calls.updateSerialReceipt).toHaveLength(0);
    expect(repositories.calls.createException[0]).toMatchObject({ ruleCode: "DUPLICATE_SCAN", contextType: "GRN" });
  });

  test("T02-08 treats a unique-index conflict on insertScan as a duplicate, not a match", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "PENDING" },
      expectedLine: { serialId: 7, destinationWarehouseId: 5 },
      validationResult: {
        valid: true,
        serial: { serialId: 7, serialNo: "MTK1234567890", currentStatus: "IN_TRANSIT", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    // Simulate the partial unique index rejecting a concurrent receipt:
    // INSERT ... ON CONFLICT DO NOTHING returns no row.
    repositories.grns.insertScan = async (input) => {
      repositories.calls.insertScan.push(input);
      return null;
    };
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 10, serialNo: "MTK1234567890", userId: "operator_1" });

    expect(result.matchStatus).toBe("DUPLICATE_SCAN");
    expect(repositories.calls.updateSerialReceipt).toHaveLength(0);
    expect(repositories.calls.appendEvent).toHaveLength(0);
    expect(repositories.calls.createException[0]).toMatchObject({ ruleCode: "DUPLICATE_SCAN", contextType: "GRN" });
  });

  test("T02-02 completion closes the warehouse-scoped GRN without inventing SHORT exceptions", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "IN_PROGRESS" },
      validationResult: null
    });
    const service = createGrnService({ repositories });

    const result = await service.completeGrn({ grnId: 10, userId: "operator_1" });

    expect(result.status).toBe("CLOSED");
    expect(result.summary).toMatchObject({ scannedCount: 1 });
    expect(repositories.calls.createException).toHaveLength(0);
  });
});

// Dispatch-doc-bound GRN: operator enters a dispatch number first, sees expected
// products (no serials), and scans are validated at the product level.
function createDocRepositories({ doc, openGrn = null, completedGrn = null, productsInDoc = [], expected = [], received = [], validationResult }) {
  const calls = { createGrn: [], insertScan: [], updateSerialReceipt: [], createException: [] };
  const repositories = {
    calls,
    async withTransaction(work) {
      return work(repositories);
    },
    grns: {
      async findDocByRef(externalRef) {
        return doc?.externalRef === externalRef ? doc : null;
      },
      async findCompletedByDoc() {
        return completedGrn;
      },
      async findOpenByDoc() {
        return openGrn;
      },
      async create(input) {
        calls.createGrn.push(input);
        return { grnId: 50, status: "PENDING", ...input };
      },
      async findById(grnId) {
        return { grnId, sapDispatchDocId: doc.sapDispatchDocId, receivingWarehouseId: doc.destinationWarehouseId, status: "PENDING" };
      },
      async lockById(grnId) {
        return { grnId, sapDispatchDocId: doc.sapDispatchDocId, receivingWarehouseId: doc.destinationWarehouseId, status: "PENDING" };
      },
      async findScanBySerial() {
        return null;
      },
      async isProductInDoc(_docId, productId) {
        return productsInDoc.includes(productId);
      },
      async expectedProducts() {
        return expected;
      },
      async receivedCountsByProduct() {
        return received;
      },
      async insertScan(input) {
        calls.insertScan.push(input);
        return { grnScanId: calls.insertScan.length, ...input };
      },
      async updateStatus() {}
    },
    serials: {
      async updateReceipt(serialId, warehouseId, receivedBy) {
        calls.updateSerialReceipt.push({ serialId, warehouseId, receivedBy });
      },
      async appendSerialEvent() {}
    },
    exceptionsRepo: {
      async createException(input) {
        calls.createException.push(input);
        return { exceptionId: calls.createException.length, ruleCode: input.ruleCode, status: "OPEN" };
      }
    },
    validationService: {
      async validateSerial() {
        return validationResult;
      }
    }
  };
  return repositories;
}

describe("IDM-02 GRN service — dispatch-doc-bound", () => {
  test("startGrn binds the GRN to the dispatch doc and returns expected products with received counts", async () => {
    const repositories = createDocRepositories({
      doc: { sapDispatchDocId: 99, externalRef: "DISP-001", destinationWarehouseId: 5 },
      expected: [{ productId: 7, productName: "Inverter 1KVA", batchNo: "B1", expectedQty: 3 }],
      received: [{ productId: 7, batchNo: "B1", receivedQty: 1 }]
    });
    const service = createGrnService({ repositories });

    const result = await service.startGrn({
      receivingWarehouseId: 5,
      dispatchRef: "DISP-001",
      role: "admin",
      userId: "operator_1"
    });

    expect(result.sapDispatchDocId).toBe(99);
    expect(result.dispatchRef).toBe("DISP-001");
    expect(result.expectedProducts).toEqual([
      { productId: 7, productName: "Inverter 1KVA", batchNo: "B1", expectedQty: 3, receivedQty: 1 }
    ]);
    expect(repositories.calls.createGrn[0]).toMatchObject({ receivingWarehouseId: 5, sapDispatchDocId: 99 });
  });

  test("startGrn rejects a dispatch doc destined for a different warehouse", async () => {
    const repositories = createDocRepositories({
      doc: { sapDispatchDocId: 99, externalRef: "DISP-001", destinationWarehouseId: 8 },
      validationResult: null
    });
    const service = createGrnService({ repositories });

    await expect(
      service.startGrn({ receivingWarehouseId: 5, dispatchRef: "DISP-001", role: "admin", userId: "operator_1" })
    ).rejects.toMatchObject({ status: 409, code: "WRONG_WAREHOUSE" });
  });

  test("startGrn blocks a dispatch doc that was already received (closed GRN exists)", async () => {
    const repositories = createDocRepositories({
      doc: { sapDispatchDocId: 99, externalRef: "DISP-001", destinationWarehouseId: 5 },
      completedGrn: { grnId: 40, status: "CLOSED" },
      validationResult: null
    });
    const service = createGrnService({ repositories });

    await expect(
      service.startGrn({ receivingWarehouseId: 5, dispatchRef: "DISP-001", role: "admin", userId: "operator_1" })
    ).rejects.toMatchObject({ status: 409, code: "ALREADY_RECEIVED" });
    expect(repositories.calls.createGrn).toHaveLength(0);
  });

  test("startGrn blocks a dispatch doc already marked GRN_CLOSED", async () => {
    const repositories = createDocRepositories({
      doc: { sapDispatchDocId: 99, externalRef: "DISP-001", destinationWarehouseId: 5, status: "GRN_CLOSED" },
      validationResult: null
    });
    const service = createGrnService({ repositories });

    await expect(
      service.startGrn({ receivingWarehouseId: 5, dispatchRef: "DISP-001", role: "admin", userId: "operator_1" })
    ).rejects.toMatchObject({ status: 409, code: "ALREADY_RECEIVED" });
  });

  test("scanSerial accepts a serial whose product is on the dispatch doc", async () => {
    const repositories = createDocRepositories({
      doc: { sapDispatchDocId: 99, externalRef: "DISP-001", destinationWarehouseId: 5 },
      productsInDoc: [7],
      validationResult: {
        valid: true,
        serial: { serialId: 12, serialNo: "MTK1234567890", productId: 7, currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 50, serialNo: "MTK1234567890", userId: "operator_1" });

    expect(result.matchStatus).toBe("MATCHED");
    expect(repositories.calls.updateSerialReceipt).toEqual([{ serialId: 12, warehouseId: 5, receivedBy: "operator_1" }]);
    expect(repositories.calls.insertScan[0]).toMatchObject({ matchStatus: "MATCHED" });
  });

  test("scanSerial rejects a serial whose product is NOT on the dispatch doc", async () => {
    const repositories = createDocRepositories({
      doc: { sapDispatchDocId: 99, externalRef: "DISP-001", destinationWarehouseId: 5 },
      productsInDoc: [7],
      validationResult: {
        valid: true,
        serial: { serialId: 13, serialNo: "MTK9999999999", productId: 42, currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createGrnService({ repositories });

    const result = await service.scanSerial({ grnId: 50, serialNo: "MTK9999999999", userId: "operator_1" });

    expect(result.valid).toBe(false);
    expect(result.matchStatus).toBe("WRONG_SERIAL");
    expect(result.alert.message).toMatch(/not part of this dispatch document/i);
    expect(repositories.calls.insertScan[0]).toMatchObject({ matchStatus: "WRONG_SERIAL" });
    expect(repositories.calls.updateSerialReceipt).toHaveLength(0);
  });
});
