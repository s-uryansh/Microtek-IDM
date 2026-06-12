import { describe, expect, test } from "vitest";

import { createDispatchService } from "../src/idm05/dispatchService.js";
import { createFulfilmentStatusService } from "../src/idm07/fulfilmentStatusService.js";

function createRepositories({
  dispatch,
  invoice,
  validationResult,
  insertScanResult,
  updateSerialResult = true,
  availableStockQuantity = 10,
  batteryCommit = null
}) {
  const calls = {
    createDispatch: [],
    lockDispatch: [],
    insertScan: [],
    updateSerial: [],
    appendEvent: [],
    updateDispatchStatus: [],
    updateInvoiceStatus: [],
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
      async setDispatchTargetQuantity(dispatchId, targetQuantity) {
        calls.setDispatchTargetQuantity = { dispatchId, targetQuantity };
        return { ...dispatch, targetQuantity };
      },
      async findByInvoiceId(invoiceId) {
        return dispatch?.invoiceId === invoiceId ? dispatch : null;
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
      async countAvailableStock({ warehouseId, productIds }) {
        calls.countAvailableStock = { warehouseId, productIds };
        return availableStockQuantity;
      },
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
    batteryPreBilling: {
      async findCommitBySerial() {
        return batteryCommit;
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

  test("dispatches the full remaining invoice quantity when stock is sufficient", async () => {
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
      dispatchQuantity: 2,
      targetQuantity: 2,
      remainingInvoiceQuantity: 2,
      currentWarehouseStockQty: 10,
      partial: false
    });
    expect(repositories.calls.createDispatch[0]).toMatchObject({
      invoiceId: 100,
      warehouseId: 5,
      targetQuantity: 2
    });
    expect(repositories.calls.createException).toHaveLength(0);
    expect(repositories.calls.countAvailableStock).toEqual({ warehouseId: 5, productIds: [7] });
  });

  test("partially dispatches available stock and raises a SHORT exception when stock is insufficient", async () => {
    const repositories = createRepositories({ invoice, availableStockQuantity: 1 });
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
      dispatchQuantity: 1,
      targetQuantity: 1,
      remainingInvoiceQuantity: 2,
      currentWarehouseStockQty: 1,
      partial: true
    });
    expect(result.partialException).toMatchObject({ ruleCode: "SHORT", status: "OPEN" });
    expect(repositories.calls.createDispatch[0]).toMatchObject({ targetQuantity: 1 });
    expect(repositories.calls.createException[0]).toMatchObject({
      ruleCode: "SHORT",
      contextType: "DISPATCH",
      contextId: 10,
      warehouseId: 5,
      raisedBy: "operator_1"
    });
  });

  test("rejects when there is no stock available at all", async () => {
    const repositories = createRepositories({ invoice, availableStockQuantity: 0 });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    await expect(service.startDispatch({
      invoiceId: 100,
      warehouseId: 5,
      userId: "operator_1"
    })).rejects.toMatchObject({
      status: 409,
      code: "NO_WAREHOUSE_STOCK"
    });
  });

  test("resumes an existing partial dispatch for the remaining invoice quantity once stock arrives", async () => {
    const repositories = createRepositories({
      invoice: {
        ...invoice,
        lines: [{ invoiceLineId: 200, productId: 7, quantity: 4 }]
      },
      dispatch: {
        dispatchId: 10,
        invoiceId: 100,
        warehouseId: 5,
        status: "DISPATCHED",
        targetQuantity: 2,
        lines: [{ invoiceLineId: 200, productId: 7, quantity: 4 }],
        scans: [
          { dispatchScanId: 1, invoiceLineId: 200, serialId: 1 },
          { dispatchScanId: 2, invoiceLineId: 200, serialId: 2 }
        ]
      }
    });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.startDispatch({
      invoiceId: 100,
      warehouseId: 5,
      userId: "operator_1"
    });

    // 4 required - 2 already scanned = 2 remaining; stock (10) covers it, so full.
    expect(result).toMatchObject({
      dispatchId: 10,
      dispatchQuantity: 2,
      targetQuantity: 4,
      alreadyScannedQuantity: 2,
      remainingInvoiceQuantity: 2,
      partial: false
    });
    expect(repositories.calls.setDispatchTargetQuantity).toEqual({ dispatchId: 10, targetQuantity: 4 });
  });

  test("starts a dispatch when repository ids are returned as strings", async () => {
    const repositories = createRepositories({
      invoice: {
        ...invoice,
        warehouseId: "5",
        lines: [{ invoiceLineId: "200", productId: "7", quantity: 2 }]
      }
    });
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
  });

  test("marks missing or wrong-warehouse invoice as not found", async () => {
    const repositories = createRepositories({ invoice: null });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    await expect(service.startDispatch({
      invoiceId: 999,
      warehouseId: 5,
      userId: "operator_1"
    })).rejects.toMatchObject({
      message: "Invoice not found",
      status: 404
    });
  });

  test("resumes an existing dispatch for later invoice quantity", async () => {
    const repositories = createRepositories({
      invoice,
      dispatch: {
        dispatchId: 10,
        invoiceId: 100,
        warehouseId: 5,
        status: "PENDING",
        lines: invoice.lines,
        scans: []
      }
    });
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
      targetQuantity: 2,
      remainingInvoiceQuantity: 2
    });
    expect(repositories.calls.createDispatch).toEqual([]);
  });

  test("accepts a valid physical QR scan and maps it to the matching invoice line", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "PENDING",
      targetQuantity: 1,
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

  test("blocks dispatch of a battery serial that was not pre-billed", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "PENDING",
      targetQuantity: 1,
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 1, isBattery: true }],
      scans: []
    };
    const repositories = createRepositories({
      dispatch,
      batteryCommit: null, // not pre-billed
      validationResult: {
        valid: true,
        serial: { serialId: 1, serialNo: "EB100-0001", productId: 7, currentStatus: "IN_STOCK", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createDispatchService({ repositories, fulfilmentStatusService: createFulfilmentStatusService() });

    const result = await service.scanSerial({ dispatchId: 10, serialNo: "EB100-0001", userId: "operator_1" });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("BATTERY_NOT_PREBILLED");
    expect(repositories.calls.updateSerial).toHaveLength(0);
    expect(repositories.calls.insertScan).toHaveLength(0);
  });

  test("allows dispatch of a battery serial once it has been pre-billed", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "PENDING",
      targetQuantity: 1,
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 1, isBattery: true }],
      scans: []
    };
    const repositories = createRepositories({
      dispatch,
      batteryCommit: { batteryPreBillingId: 1, serialId: 1 },
      validationResult: {
        valid: true,
        serial: { serialId: 1, serialNo: "EB100-0001", productId: 7, currentStatus: "IN_STOCK", currentWarehouseId: 5 },
        alert: null,
        exception: null
      }
    });
    const service = createDispatchService({ repositories, fulfilmentStatusService: createFulfilmentStatusService() });

    const result = await service.scanSerial({ dispatchId: 10, serialNo: "EB100-0001", userId: "operator_1" });

    expect(result.valid).toBe(true);
    expect(result.status).toBe("DISPATCHED");
  });

  test("blocks scans once the selected dispatch quantity is reached", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "IN_PROGRESS",
      targetQuantity: 1,
      lines: [{ invoiceLineId: 200, productId: 7, quantity: 4 }],
      scans: [{ dispatchScanId: 1, invoiceLineId: 200, serialId: 1 }]
    };
    const repositories = createRepositories({
      dispatch,
      validationResult: {
        valid: true,
        serial: {
          serialId: 2,
          serialNo: "MTK1234567899",
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
      serialNo: "MTK1234567899",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("DISPATCH_QUANTITY_REACHED");
    expect(repositories.calls.insertScan).toHaveLength(0);
  });

  test("accepts a scan when dispatch line ids are returned as strings", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: "5",
      status: "PENDING",
      lines: [{ invoiceLineId: "200", productId: "7", quantity: 1 }],
      scans: []
    };
    const repositories = createRepositories({
      invoice,
      dispatch,
      validationResult: {
        valid: true,
        serial: { serialId: "300", serialNo: "MTK1234567890", productId: "7" }
      }
    });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.scanSerial({
      dispatchId: 10,
      serialNo: "MTK1234567890",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
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
        valid: true,
        serial: {
          serialId: 1,
          serialNo: "MTK1234567890",
          productId: 99,
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

  test("blocks completion when selected dispatch quantity is not fully scanned", async () => {
    const dispatch = {
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "IN_PROGRESS",
      targetQuantity: 2,
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
