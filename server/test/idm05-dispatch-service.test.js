import { describe, expect, test } from "vitest";

import { createDispatchService } from "../src/idm05/dispatchService.js";
import { createFulfilmentStatusService } from "../src/idm07/fulfilmentStatusService.js";

function createRepositories({ dispatch, invoice, validationResult, insertScanResult, updateSerialResult = true }) {
  const calls = {
    createDispatch: [],
    lockDispatch: [],
    insertScan: [],
    updateSerial: [],
    appendEvent: [],
    updateDispatchStatus: [],
    updateInvoiceStatus: [],
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
    invoices: {
      async findById(invoiceId) {
        return invoice?.invoiceId === invoiceId ? invoice : null;
      },
      async updateStatus(invoiceId, status) {
        calls.updateInvoiceStatus.push({ invoiceId, status });
      }
    },
    dispatches: {
      async createDispatch(input) {
        calls.createDispatch.push(input);
        return { dispatchId: 10, status: "PENDING", ...input };
      },
      async findById(dispatchId) {
        return dispatch?.dispatchId === dispatchId ? dispatch : null;
      },
      async lockById(dispatchId) {
        calls.lockDispatch.push(dispatchId);
        return dispatch?.dispatchId === dispatchId ? dispatch : null;
      },
      async insertScan(input) {
        calls.insertScan.push(input);
        if (insertScanResult === null) {
          return null;
        }
        return insertScanResult ?? { dispatchScanId: calls.insertScan.length, ...input };
      },
      async updateStatus(dispatchId, status) {
        calls.updateDispatchStatus.push({ dispatchId, status });
      },
      async countScans(_dispatchId) {
        return dispatch.scans.length + calls.insertScan.length;
      },
      async countScansForLine(_dispatchId, invoiceLineId) {
        return dispatch.scans.filter((scan) => scan.invoiceLineId === invoiceLineId).length;
      }
    },
    serials: {
      async updateStatusIfCurrent(serialId, expectedStatus, status, updatedBy) {
        calls.updateSerial.push({ serialId, expectedStatus, status, updatedBy });
        return updateSerialResult;
      },
      async updateStatus(serialId, status, updatedBy) {
        calls.updateSerial.push({ serialId, status, updatedBy });
      },
      async appendSerialEvent(event) {
        calls.appendEvent.push(event);
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

const invoice = {
  invoiceId: 100,
  warehouseId: 5,
  status: "PENDING",
  lines: [{ invoiceLineId: 200, productId: 7, quantity: 2 }]
};

describe("IDM-05 dispatch service", () => {
  test("starts a dispatch for an invoice in the caller warehouse", async () => {
    const repositories = createRepositories({ invoice });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.startDispatch({
      invoiceId: 100,
      warehouseId: 5,
      userId: "operator_1"
    });

    expect(result).toMatchObject({
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "PENDING"
    });
    expect(repositories.calls.createDispatch[0]).toMatchObject({
      invoiceId: 100,
      warehouseId: 5,
      createdBy: "operator_1"
    });
  });

  test("accepts a valid scan, dispatches the serial, and writes a CUSTOMER_DISPATCH event", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "PENDING",
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 1 }],
      scans: []
    };
    const repositories = createRepositories({
      dispatch,
      validationResult: {
        valid: true,
        serial: {
          serialId: 1,
          serialNo: "MTK1234567890",
          productId: 7,
          currentStatus: "IN_STOCK",
          currentWarehouseId: 5
        },
        alert: null,
        exception: null
      }
    });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.scanSerial({
      dispatchId: 10,
      invoiceLineId: 200,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
    expect(result.status).toBe("DISPATCHED");
    expect(repositories.calls.insertScan[0]).toMatchObject({
      dispatchId: 10,
      invoiceLineId: 200,
      serialId: 1,
      scannedBy: "operator_1"
    });
    expect(repositories.calls.transaction).toEqual(["begin", "commit"]);
    expect(repositories.calls.lockDispatch).toEqual([10]);
    expect(repositories.calls.updateSerial).toEqual([
      { serialId: 1, expectedStatus: "IN_STOCK", status: "DISPATCHED", updatedBy: "operator_1" }
    ]);
    expect(repositories.calls.appendEvent[0]).toMatchObject({
      serialId: 1,
      eventType: "CUSTOMER_DISPATCH",
      referenceType: "DISPATCH",
      referenceId: 10,
      createdBy: "operator_1"
    });
  });

  test("rejects product-invoice mismatch without dispatching serial", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "PENDING",
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 1 }],
      scans: []
    };
    const repositories = createRepositories({
      dispatch,
      validationResult: {
        valid: false,
        serial: null,
        alert: {
          ruleCode: "PRODUCT_INVOICE_MISMATCH",
          message: "Serial product does not match the invoice line."
        },
        exception: { exceptionId: 5, ruleCode: "PRODUCT_INVOICE_MISMATCH", status: "OPEN" }
      }
    });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.scanSerial({
      dispatchId: 10,
      invoiceLineId: 200,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("PRODUCT_INVOICE_MISMATCH");
    expect(repositories.calls.insertScan).toHaveLength(0);
    expect(repositories.calls.updateSerial).toHaveLength(0);
  });

  test("does not append dispatch events when a duplicate scan is detected", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "IN_PROGRESS",
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 1 }],
      scans: [{ dispatchScanId: 1, invoiceLineId: 200, serialId: 1 }]
    };
    const repositories = createRepositories({
      dispatch,
      insertScanResult: null,
      validationResult: {
        valid: true,
        serial: {
          serialId: 1,
          serialNo: "MTK1234567890",
          productId: 7,
          currentStatus: "IN_STOCK",
          currentWarehouseId: 5
        },
        alert: null,
        exception: null
      }
    });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.scanSerial({
      dispatchId: 10,
      invoiceLineId: 200,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_DISPATCHED");
    expect(repositories.calls.appendEvent).toHaveLength(0);
    expect(repositories.calls.updateDispatchStatus).toHaveLength(0);
    expect(repositories.calls.transaction).toEqual(["begin", "commit"]);
  });

  test("does not insert a scan when a concurrent status update already dispatched the serial", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "IN_PROGRESS",
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 2 }],
      scans: []
    };
    const repositories = createRepositories({
      dispatch,
      updateSerialResult: false,
      validationResult: {
        valid: true,
        serial: {
          serialId: 1,
          serialNo: "MTK1234567890",
          productId: 7,
          currentStatus: "IN_STOCK",
          currentWarehouseId: 5
        },
        alert: null,
        exception: null
      }
    });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.scanSerial({
      dispatchId: 10,
      invoiceLineId: 200,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_DISPATCHED");
    expect(repositories.calls.insertScan).toHaveLength(0);
    expect(repositories.calls.appendEvent).toHaveLength(0);
    expect(repositories.calls.updateDispatchStatus).toHaveLength(0);
    expect(repositories.calls.transaction).toEqual(["begin", "commit"]);
  });

  test("blocks completion when invoice lines are not fully scanned", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "IN_PROGRESS",
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 2 }],
      scans: [{ dispatchScanId: 1 }]
    };
    const repositories = createRepositories({ dispatch });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.completeDispatch({
      dispatchId: 10,
      userId: "operator_1"
    });

    expect(result).toEqual({
      completed: false,
      status: "IN_PROGRESS",
      reason: "INCOMPLETE_DISPATCH"
    });
    expect(repositories.calls.updateDispatchStatus).toEqual([{ dispatchId: 10, status: "IN_PROGRESS" }]);
  });
});
