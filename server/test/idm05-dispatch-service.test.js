import { describe, expect, test } from "vitest";

import { createDispatchService } from "../src/idm05/dispatchService.js";
import { createFulfilmentStatusService } from "../src/idm07/fulfilmentStatusService.js";

function createRepositories({
  dispatch,
  invoice,
  validationResult,
  insertScanResult,
  updateSerialResult = true,
  availableStockQuantity = 10
}) {
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

  test("starts a dispatch with a per-session quantity cap selected by the operator", async () => {
    const repositories = createRepositories({ invoice });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    const result = await service.startDispatch({
      invoiceId: 100,
      warehouseId: 5,
      dispatchQuantity: 1,
      userId: "operator_1"
    });

    expect(result).toMatchObject({
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      dispatchQuantity: 1,
      targetQuantity: 1,
      remainingInvoiceQuantity: 2,
      currentWarehouseStockQty: 10
    });
    expect(repositories.calls.createDispatch[0]).toMatchObject({
      invoiceId: 100,
      warehouseId: 5,
      targetQuantity: 1
    });
    expect(repositories.calls.countAvailableStock).toEqual({ warehouseId: 5, productIds: [7] });
  });

  test("rejects dispatch quantity greater than current matching warehouse stock", async () => {
    const repositories = createRepositories({ invoice, availableStockQuantity: 1 });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    await expect(service.startDispatch({
      invoiceId: 100,
      warehouseId: 5,
      dispatchQuantity: 2,
      userId: "operator_1"
    })).rejects.toMatchObject({
      status: 409,
      code: "INSUFFICIENT_WAREHOUSE_STOCK"
    });
  });

  test("rejects a dispatch quantity greater than invoice remaining quantity", async () => {
    const repositories = createRepositories({
      invoice,
      dispatch: {
        dispatchId: 10,
        invoiceId: 100,
        warehouseId: 5,
        status: "IN_PROGRESS",
        targetQuantity: 1,
        lines: invoice.lines,
        scans: [{ dispatchScanId: 1, invoiceLineId: 200, serialId: 1 }]
      }
    });
    const service = createDispatchService({
      repositories,
      fulfilmentStatusService: createFulfilmentStatusService()
    });

    await expect(service.startDispatch({
      invoiceId: 100,
      warehouseId: 5,
      dispatchQuantity: 2,
      userId: "operator_1"
    })).rejects.toMatchObject({
      status: 409,
      code: "DISPATCH_QUANTITY_EXCEEDS_REMAINING"
    });
  });

  test("resumes by adding selected quantity to already scanned invoice quantity", async () => {
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
      dispatchQuantity: 1,
      userId: "operator_1"
    });

    expect(result).toMatchObject({
      dispatchId: 10,
      dispatchQuantity: 1,
      targetQuantity: 3,
      alreadyScannedQuantity: 2,
      remainingInvoiceQuantity: 2
    });
    expect(repositories.calls.setDispatchTargetQuantity).toEqual({ dispatchId: 10, targetQuantity: 3 });
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
