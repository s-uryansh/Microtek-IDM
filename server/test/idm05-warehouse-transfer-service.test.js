import { describe, expect, test } from "vitest";

import { createWarehouseTransferService } from "../src/idm05/warehouseTransferService.js";

// A transfer is now invoice-gated (Finding #3) exactly like a customer dispatch,
// so every startTransfer needs an invoice that findById can resolve, and each
// scanned product is capped by that invoice's line quantities. The default
// invoice authorises product 7 (used by the scan tests) with ample quantity.
// Since V030, transfer invoices are a distinct kind: they must carry
// invoiceType "TRANSFER" and their own source/destination route, which has to
// match the transfer being started.
const DEFAULT_INVOICE = {
  invoiceId: 100,
  invoiceType: "TRANSFER",
  sourceWarehouseId: 1,
  destinationWarehouseId: 2,
  lines: [{ productId: 7, quantity: 10 }]
};

function createRepositories({
  existingDoc = null,
  upsertResult,
  validationResult,
  lineCount = 0,
  insertLineResult,
  updateSerialResult = true,
  invoice = DEFAULT_INVOICE,
  scannedByProduct = {}
} = {}) {
  const calls = {
    findDocByRef: [],
    upsertDoc: [],
    lockDoc: [],
    countLines: [],
    countLinesByProduct: [],
    updateSerial: [],
    insertLine: [],
    appendEvent: [],
    createException: [],
    transaction: []
  };

  const repositories = {
    calls,
    async withTransaction(work) {
      calls.transaction.push("begin");
      try {
        const result = await work(repositories);
        calls.transaction.push("commit");
        return result;
      } catch (error) {
        calls.transaction.push("rollback");
        throw error;
      }
    },
    grns: {
      async findDocByRef(externalRef, scope) {
        calls.findDocByRef.push({ externalRef, scope });
        return existingDoc?.externalRef === externalRef ? existingDoc : null;
      }
    },
    sapDispatches: {
      async upsertDoc(input) {
        calls.upsertDoc.push(input);
        return upsertResult ?? { sapDispatchDocId: 50, ...input };
      },
      async lockDocById(sapDispatchDocId) {
        calls.lockDoc.push(sapDispatchDocId);
      },
      async countLines(sapDispatchDocId) {
        calls.countLines.push(sapDispatchDocId);
        return lineCount;
      },
      async countLinesByProduct(sapDispatchDocId, productId) {
        calls.countLinesByProduct.push({ sapDispatchDocId, productId });
        return scannedByProduct[productId] ?? 0;
      },
      async insertLine(input) {
        calls.insertLine.push(input);
        if (insertLineResult === null) return null;
        return insertLineResult ?? { sapDispatchLineId: calls.insertLine.length, ...input };
      },
      async findById(sapDispatchDocId) {
        return existingDoc?.sapDispatchDocId === sapDispatchDocId ? existingDoc : null;
      }
    },
    invoices: {
      async findById(invoiceId) {
        return invoice?.invoiceId === invoiceId ? invoice : null;
      }
    },
    serials: {
      async updateStatusIfCurrent(serialId, expectedStatus, status, updatedBy) {
        calls.updateSerial.push({ serialId, expectedStatus, status, updatedBy });
        return updateSerialResult;
      },
      async appendSerialEvent(event) {
        calls.appendEvent.push(event);
      }
    },
    validationService: {
      async validateSerial() {
        return validationResult;
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

describe("IDM-05 warehouse transfer service", () => {
  test("starts a transfer with a generated reference when none is given", async () => {
    const repositories = createRepositories();
    const service = createWarehouseTransferService({ repositories });

    const result = await service.startTransfer({
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      reference: "",
      invoiceId: 100,
      userId: "operator_1"
    });

    expect(result.sapDispatchDocId).toBe(50);
    expect(repositories.calls.upsertDoc[0]).toMatchObject({
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      batchId: null,
      invoiceId: 100,
      createdBy: "operator_1"
    });
    expect(repositories.calls.upsertDoc[0].externalRef).toMatch(/^WT-1-2-/);
  });

  test("starts a transfer with an operator-provided reference", async () => {
    const repositories = createRepositories();
    const service = createWarehouseTransferService({ repositories });

    const result = await service.startTransfer({
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      reference: "  NOTE-42  ",
      invoiceId: 100,
      userId: "operator_1"
    });

    expect(repositories.calls.upsertDoc[0].externalRef).toBe("NOTE-42");
    expect(result.sapDispatchDocId).toBe(50);
  });

  test("rejects a transfer with the same source and destination warehouse", async () => {
    const repositories = createRepositories();
    const service = createWarehouseTransferService({ repositories });

    await expect(
      service.startTransfer({ sourceWarehouseId: 1, destinationWarehouseId: 1, reference: "", userId: "operator_1" })
    ).rejects.toMatchObject({ status: 400 });
    expect(repositories.calls.upsertDoc).toHaveLength(0);
  });

  test("resumes an existing open transfer on the same route when the reference is reused", async () => {
    const repositories = createRepositories({
      existingDoc: {
        sapDispatchDocId: 50,
        externalRef: "NOTE-42",
        sourceWarehouseId: 1,
        destinationWarehouseId: 2,
        status: "IMPORTED"
      }
    });
    const service = createWarehouseTransferService({ repositories });

    const result = await service.startTransfer({
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      reference: "NOTE-42",
      invoiceId: 100,
      userId: "operator_1"
    });

    expect(result.sapDispatchDocId).toBe(50);
    expect(repositories.calls.upsertDoc[0]).toMatchObject({ externalRef: "NOTE-42" });
  });

  test("rejects a reference already used by a different warehouse route", async () => {
    const repositories = createRepositories({
      existingDoc: {
        sapDispatchDocId: 50,
        externalRef: "NOTE-42",
        sourceWarehouseId: 9,
        destinationWarehouseId: 2,
        status: "IMPORTED"
      }
    });
    const service = createWarehouseTransferService({ repositories });

    await expect(
      service.startTransfer({ sourceWarehouseId: 1, destinationWarehouseId: 2, reference: "NOTE-42", invoiceId: 100, userId: "operator_1" })
    ).rejects.toMatchObject({ status: 409, code: "REFERENCE_IN_USE" });
    expect(repositories.calls.upsertDoc).toHaveLength(0);
  });

  test("rejects a reference for a transfer that was already received", async () => {
    const repositories = createRepositories({
      existingDoc: {
        sapDispatchDocId: 50,
        externalRef: "NOTE-42",
        sourceWarehouseId: 1,
        destinationWarehouseId: 2,
        status: "GRN_CLOSED"
      }
    });
    const service = createWarehouseTransferService({ repositories });

    await expect(
      service.startTransfer({ sourceWarehouseId: 1, destinationWarehouseId: 2, reference: "NOTE-42", invoiceId: 100, userId: "operator_1" })
    ).rejects.toMatchObject({ status: 409, code: "ALREADY_RECEIVED" });
  });

  test("rejects a transfer that is not backed by an invoice", async () => {
    const repositories = createRepositories();
    const service = createWarehouseTransferService({ repositories });

    await expect(
      service.startTransfer({ sourceWarehouseId: 1, destinationWarehouseId: 2, reference: "", userId: "operator_1" })
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(repositories.calls.upsertDoc).toHaveLength(0);
  });

  test("rejects a transfer whose invoice does not exist", async () => {
    const repositories = createRepositories();
    const service = createWarehouseTransferService({ repositories });

    await expect(
      service.startTransfer({
        sourceWarehouseId: 1,
        destinationWarehouseId: 2,
        reference: "",
        invoiceId: 999,
        userId: "operator_1"
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(repositories.calls.upsertDoc).toHaveLength(0);
  });

  test("rejects a customer invoice as the gate for a warehouse transfer", async () => {
    const repositories = createRepositories({
      invoice: {
        invoiceId: 100,
        invoiceType: "CUSTOMER",
        sourceWarehouseId: 1,
        destinationWarehouseId: null,
        lines: [{ productId: 7, quantity: 10 }]
      }
    });
    const service = createWarehouseTransferService({ repositories });

    await expect(
      service.startTransfer({
        sourceWarehouseId: 1,
        destinationWarehouseId: 2,
        reference: "",
        invoiceId: 100,
        userId: "operator_1"
      })
    ).rejects.toMatchObject({ status: 409, code: "INVOICE_TYPE_MISMATCH" });
    expect(repositories.calls.upsertDoc).toHaveLength(0);
  });

  test("rejects a transfer invoice whose route does not match the transfer", async () => {
    // Invoice authorises 1 -> 2, but the operator tries to run 1 -> 3 with it.
    const repositories = createRepositories();
    const service = createWarehouseTransferService({ repositories });

    await expect(
      service.startTransfer({
        sourceWarehouseId: 1,
        destinationWarehouseId: 3,
        reference: "",
        invoiceId: 100,
        userId: "operator_1"
      })
    ).rejects.toMatchObject({ status: 409, code: "TRANSFER_ROUTE_MISMATCH" });
    expect(repositories.calls.upsertDoc).toHaveLength(0);
  });

  test("rejects a scanned serial whose product is not on the transfer invoice", async () => {
    const repositories = createRepositories({
      existingDoc: { sapDispatchDocId: 50, invoiceId: 100, sourceWarehouseId: 1, destinationWarehouseId: 2 },
      validationResult: {
        valid: true,
        // Product 99 is absent from the default invoice (which only authorises product 7).
        serial: { serialId: 1, serialNo: "MTK1234567890", productId: 99, currentStatus: "IN_STOCK", currentWarehouseId: 1 },
        alert: null,
        exception: null
      }
    });
    const service = createWarehouseTransferService({ repositories });

    const result = await service.scanSerial({
      sapDispatchDocId: 50,
      sourceWarehouseId: 1,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("PRODUCT_INVOICE_MISMATCH");
    expect(repositories.calls.updateSerial).toHaveLength(0);
    expect(repositories.calls.insertLine).toHaveLength(0);
  });

  test("rejects a scanned serial once the invoice line quantity is exhausted", async () => {
    const repositories = createRepositories({
      existingDoc: { sapDispatchDocId: 50, invoiceId: 100, sourceWarehouseId: 1, destinationWarehouseId: 2 },
      // Product 7 is authorised for 10 units; 10 are already scanned, so the cap is spent.
      scannedByProduct: { 7: 10 },
      validationResult: {
        valid: true,
        serial: { serialId: 1, serialNo: "MTK1234567890", productId: 7, currentStatus: "IN_STOCK", currentWarehouseId: 1 },
        alert: null,
        exception: null
      }
    });
    const service = createWarehouseTransferService({ repositories });

    const result = await service.scanSerial({
      sapDispatchDocId: 50,
      sourceWarehouseId: 1,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("PRODUCT_INVOICE_MISMATCH");
    expect(repositories.calls.insertLine).toHaveLength(0);
  });

  test("scans a serial out of the source warehouse and creates a dispatch line", async () => {
    const repositories = createRepositories({
      lineCount: 2,
      validationResult: {
        valid: true,
        serial: { serialId: 1, serialNo: "MTK1234567890", productId: 7, currentStatus: "IN_STOCK", currentWarehouseId: 1 },
        alert: null,
        exception: null
      }
    });
    const service = createWarehouseTransferService({ repositories });

    const result = await service.scanSerial({
      sapDispatchDocId: 50,
      sourceWarehouseId: 1,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
    expect(repositories.calls.updateSerial).toEqual([
      { serialId: 1, expectedStatus: "IN_STOCK", status: "IN_TRANSIT", updatedBy: "operator_1" }
    ]);
    expect(repositories.calls.insertLine[0]).toMatchObject({
      sapDispatchDocId: 50,
      serialId: 1,
      productId: 7,
      lineNo: 3,
      createdBy: "operator_1"
    });
    expect(repositories.calls.appendEvent[0]).toMatchObject({
      serialId: 1,
      eventType: "TRANSFER",
      warehouseId: 1,
      referenceType: "DISPATCH",
      referenceId: 50,
      createdBy: "operator_1"
    });
    expect(repositories.calls.transaction).toEqual(["begin", "commit"]);
  });

  test("rejects a serial that is not currently in stock at the source warehouse", async () => {
    const repositories = createRepositories({
      validationResult: {
        valid: true,
        serial: { serialId: 1, serialNo: "MTK1234567890", productId: 7, currentStatus: "IN_TRANSIT", currentWarehouseId: 1 },
        alert: null,
        exception: null
      }
    });
    const service = createWarehouseTransferService({ repositories });

    const result = await service.scanSerial({
      sapDispatchDocId: 50,
      sourceWarehouseId: 1,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_DISPATCHED");
    expect(repositories.calls.insertLine).toHaveLength(0);
  });

  test("passes through wrong-warehouse validation failures untouched", async () => {
    const repositories = createRepositories({
      validationResult: {
        valid: false,
        serial: null,
        alert: { ruleCode: "WRONG_WAREHOUSE", message: "Serial belongs to a different warehouse." },
        exception: { exceptionId: 1, ruleCode: "WRONG_WAREHOUSE", status: "OPEN" }
      }
    });
    const service = createWarehouseTransferService({ repositories });

    const result = await service.scanSerial({
      sapDispatchDocId: 50,
      sourceWarehouseId: 1,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("WRONG_WAREHOUSE");
    expect(repositories.calls.updateSerial).toHaveLength(0);
  });

  test("does not insert a line when a concurrent status update already moved the serial", async () => {
    const repositories = createRepositories({
      updateSerialResult: false,
      validationResult: {
        valid: true,
        serial: { serialId: 1, serialNo: "MTK1234567890", productId: 7, currentStatus: "IN_STOCK", currentWarehouseId: 1 },
        alert: null,
        exception: null
      }
    });
    const service = createWarehouseTransferService({ repositories });

    const result = await service.scanSerial({
      sapDispatchDocId: 50,
      sourceWarehouseId: 1,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_DISPATCHED");
    expect(repositories.calls.insertLine).toHaveLength(0);
    expect(repositories.calls.appendEvent).toHaveLength(0);
  });

  test("getTransferWarehouseId returns the source warehouse of the doc", async () => {
    const repositories = createRepositories({
      existingDoc: { sapDispatchDocId: 50, sourceWarehouseId: 1, destinationWarehouseId: 2 }
    });
    const service = createWarehouseTransferService({ repositories });

    await expect(service.getTransferWarehouseId(50)).resolves.toBe(1);
    await expect(service.getTransferWarehouseId(999)).resolves.toBe(null);
  });
});
