import { describe, expect, test } from "vitest";

import { createImportService } from "../src/idm01/importService.js";

function createRepositories({
  productsByCode = new Map(),
  existingBatch = null,
  appendEventError = null,
  serialByNo = null,
  sapDispatchForSerial = null,
  existingReceiptScan = null
} = {}) {
  const calls = {
    createBatch: [],
    markProcessed: [],
    markFailed: [],
    insertSerial: [],
    upsertSapDispatchDoc: [],
    insertSapDispatchLine: [],
    createGrn: [],
    insertGrnScan: [],
    updateSerialReceipt: [],
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
    integrationBatches: {
      async findByKey(key) {
        return existingBatch?.direction === key.direction &&
          existingBatch?.payloadType === key.payloadType &&
          existingBatch?.externalRef === key.externalRef
          ? existingBatch
          : null;
      },
      async createPending(batch) {
        calls.createBatch.push(batch);
        return { batchId: 101, ...batch };
      },
      async markProcessed(batchId, recordCount) {
        calls.markProcessed.push({ batchId, recordCount });
      },
      async markFailed(batchId, errorDetail) {
        calls.markFailed.push({ batchId, errorDetail });
      },
      async storeRejections(batchId, rejections) {
        calls.storeRejections = { batchId, rejections };
      }
    },
    serials: {
      async findProductByCode(productCode) {
        return productsByCode.get(productCode) ?? null;
      },
      async findBySerialNo(serialNo) {
        return serialByNo?.serialNo === serialNo ? serialByNo : null;
      },
      async insertProductionSerial(serial) {
        calls.insertSerial.push(serial);
        return {
          serialId: calls.insertSerial.length,
          serialNo: serial.serialNo,
          currentWarehouseId: serial.currentWarehouseId
        };
      },
      async updateReceipt(serialId, warehouseId, receivedBy) {
        calls.updateSerialReceipt.push({ serialId, warehouseId, receivedBy });
      },
      async appendSerialEvent(event) {
        if (appendEventError) {
          throw appendEventError;
        }
        calls.appendEvent.push(event);
      }
    },
    sapDispatches: {
      async upsertDoc(input) {
        calls.upsertSapDispatchDoc.push(input);
        return { sapDispatchDocId: calls.upsertSapDispatchDoc.length, ...input };
      },
      async insertLine(input) {
        calls.insertSapDispatchLine.push(input);
        return { sapDispatchLineId: calls.insertSapDispatchLine.length, ...input };
      },
      async findBySerialId(serialId) {
        return sapDispatchForSerial?.serialId === serialId ? sapDispatchForSerial : null;
      }
    },
    grns: {
      async create(input) {
        calls.createGrn.push(input);
        return { grnId: 501, status: "PENDING", ...input };
      },
      async findScanBySerial(grnId, serialId) {
        return existingReceiptScan?.grnId === grnId && existingReceiptScan?.serialId === serialId
          ? existingReceiptScan
          : null;
      },
      async insertScan(input) {
        calls.insertGrnScan.push(input);
        return { grnScanId: calls.insertGrnScan.length, ...input };
      },
      async updateStatus(grnId, status, updatedBy) {
        calls.updateGrnStatus = { grnId, status, updatedBy };
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

describe("IDM-01 production import service", () => {
  test("imports valid production serials and writes production events", async () => {
    const repositories = createRepositories({
      productsByCode: new Map([["SKU-INV-1", { productId: 7 }]])
    });
    const service = createImportService({ repositories });

    const result = await service.importProductionBatch({
      externalRef: "SAP-PROD-001",
      source: "SAP",
      receivedBy: "integration_user",
      records: [
        {
          serialNo: "MTK1234567890",
          productCode: "SKU-INV-1",
          batchNo: "B-01",
          warehouseId: 3,
          sourceInvoiceRef: "INV-1"
        }
      ]
    });

    expect(result.status).toBe("PROCESSED");
    expect(result.importedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.rejectedRows).toEqual([]);
    expect(result.batchId).toBe(101);
    expect(result.sourceLabel).toBe("unknown");
    expect(typeof result.importedAt).toBe("string");
    expect(repositories.calls.createBatch).toHaveLength(1);
    expect(repositories.calls.insertSerial[0]).toMatchObject({
      serialNo: "MTK1234567890",
      productId: 7,
      batchNo: "B-01",
      createdBy: "integration_user"
    });
    expect(repositories.calls.appendEvent[0]).toMatchObject({
      serialId: 1,
      eventType: "PRODUCTION",
      createdBy: "integration_user"
    });
    expect(repositories.calls.markProcessed).toEqual([{ batchId: 101, recordCount: 1 }]);
  });

  test("imports SAP QR registry metadata and records factory dispatch destination", async () => {
    const repositories = createRepositories({
      productsByCode: new Map([["SKU-INV-1", { productId: 7 }]])
    });
    const service = createImportService({ repositories });

    const result = await service.importProductionBatch({
      externalRef: "SAP-GATEKEEPER-001",
      source: "SAP",
      receivedBy: "integration_user",
      records: [
        {
          qrCode: JSON.stringify({
            serialNo: "MTK1234567896",
            productCode: "SKU-INV-1",
            batchNo: "B-01",
            sourceWarehouseId: 1,
            destinationWarehouseId: 3
          })
        }
      ]
    });

    expect(result.status).toBe("PROCESSED");
    expect(repositories.calls.insertSerial[0]).toMatchObject({
      serialNo: "MTK1234567896",
      productId: 7,
      batchNo: "B-01",
      currentWarehouseId: 1,
      sourceWarehouseId: 1,
      destinationWarehouseId: 3,
      qrPayload: expect.stringContaining("MTK1234567896")
    });
    expect(repositories.calls.appendEvent).toEqual([
      expect.objectContaining({
        eventType: "PRODUCTION",
        warehouseId: 1
      }),
      expect.objectContaining({
        eventType: "FACTORY_DISPATCH",
        warehouseId: 3
      })
    ]);
    expect(repositories.calls.upsertSapDispatchDoc[0]).toMatchObject({
      externalRef: "SAP-GATEKEEPER-001",
      sourceWarehouseId: 1,
      destinationWarehouseId: 3,
      batchId: 101
    });
    expect(repositories.calls.insertSapDispatchLine[0]).toMatchObject({
      sapDispatchDocId: 1,
      serialId: 1,
      productId: 7,
      lineNo: 1
    });
  });

  test("validates a received QR against original SAP dispatch and records source to receiving warehouse", async () => {
    const repositories = createRepositories({
      serialByNo: {
        serialId: 44,
        serialNo: "MTK1234567896",
        productId: 7,
        currentStatus: "IN_TRANSIT",
        currentWarehouseId: 1
      },
      sapDispatchForSerial: {
        sapDispatchDocId: 12,
        serialId: 44,
        externalRef: "SAP-DISP-001",
        sourceWarehouseId: 1,
        destinationWarehouseId: 3
      }
    });
    const service = createImportService({ repositories });

    const result = await service.scanReceipt({
      serialNo: "MTK1234567896",
      receivingWarehouseId: 3,
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
    expect(result).toMatchObject({
      serialNo: "MTK1234567896",
      sourceWarehouseId: 1,
      receivedWarehouseId: 3,
      sapDispatchDocId: 12,
      matchStatus: "MATCHED"
    });
    expect(repositories.calls.createGrn[0]).toMatchObject({
      sapDispatchDocId: 12,
      receivingWarehouseId: 3
    });
    expect(repositories.calls.insertGrnScan[0]).toMatchObject({
      grnId: 501,
      serialId: 44,
      serialNo: "MTK1234567896",
      matchStatus: "MATCHED"
    });
    expect(repositories.calls.updateSerialReceipt).toEqual([
      { serialId: 44, warehouseId: 3, receivedBy: "operator_1" }
    ]);
    expect(repositories.calls.appendEvent[0]).toMatchObject({
      serialId: 44,
      eventType: "GRN",
      warehouseId: 3,
      referenceType: "GRN",
      referenceId: 501
    });
  });

  test("surfaces ambiguity when a serial maps to multiple SAP dispatch docs", async () => {
    const repositories = createRepositories({
      serialByNo: {
        serialId: 44,
        serialNo: "MTK1234567896",
        productId: 7,
        currentStatus: "IN_TRANSIT",
        currentWarehouseId: 1
      },
      sapDispatchForSerial: {
        sapDispatchDocId: 12,
        serialId: 44,
        externalRef: "SAP-DISP-002",
        sourceWarehouseId: 1,
        destinationWarehouseId: 3,
        ambiguous: true,
        candidateDispatchDocIds: [12, 9]
      }
    });
    const service = createImportService({ repositories });

    const result = await service.scanReceipt({
      serialNo: "MTK1234567896",
      receivingWarehouseId: 3,
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.matchStatus).toBe("AMBIGUOUS_DISPATCH");
    expect(result.candidateDispatchDocIds).toEqual([12, 9]);
    // We must not silently pick a doc and create a GRN/exception.
    expect(repositories.calls.createGrn).toHaveLength(0);
    expect(repositories.calls.createException).toHaveLength(0);
  });

  test("blocks a received QR when it arrives at a different warehouse than SAP dispatched", async () => {
    const repositories = createRepositories({
      serialByNo: {
        serialId: 44,
        serialNo: "MTK1234567896",
        productId: 7,
        currentStatus: "IN_TRANSIT",
        currentWarehouseId: 1
      },
      sapDispatchForSerial: {
        sapDispatchDocId: 12,
        serialId: 44,
        externalRef: "SAP-DISP-001",
        sourceWarehouseId: 1,
        destinationWarehouseId: 3
      }
    });
    const service = createImportService({ repositories });

    const result = await service.scanReceipt({
      serialNo: "MTK1234567896",
      receivingWarehouseId: 4,
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("WRONG_WAREHOUSE");
    expect(repositories.calls.updateSerialReceipt).toHaveLength(0);
    expect(repositories.calls.appendEvent).toHaveLength(0);
    expect(repositories.calls.createException[0]).toMatchObject({
      ruleCode: "WRONG_WAREHOUSE",
      contextType: "GRN"
    });
  });

  test("rejects unknown products while processing valid rows", async () => {
    const repositories = createRepositories({
      productsByCode: new Map([["SKU-VALID", { productId: 9 }]])
    });
    const service = createImportService({ repositories });

    const result = await service.importProductionBatch({
      externalRef: "SAP-PROD-002",
      source: "SAP",
      receivedBy: "integration_user",
      records: [
        { serialNo: "MTK1234567891", productCode: "SKU-VALID" },
        { serialNo: "MTK1234567892", productCode: "SKU-MISSING" }
      ]
    });

    expect(result.status).toBe("PROCESSED_WITH_REJECTIONS");
    expect(result.importedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.rejectedRows).toEqual([
      {
        index: 1,
        serialNo: "MTK1234567892",
        reason: "UNKNOWN_PRODUCT"
      }
    ]);
    expect(repositories.calls.markProcessed).toEqual([{ batchId: 101, recordCount: 1 }]);
  });

  test("rejects malformed records per-row instead of failing the whole batch", async () => {
    const repositories = createRepositories({
      productsByCode: new Map([["SKU-VALID", { productId: 9 }]])
    });
    const service = createImportService({ repositories });

    const result = await service.importProductionBatch({
      externalRef: "SAP-PROD-005",
      source: "SAP",
      receivedBy: "integration_user",
      records: [
        { serialNo: "MTK1234567901", productCode: "SKU-VALID" },
        { serialNo: "", productCode: "SKU-VALID" },
        { serialNo: "MTK1234567902", productCode: "" }
      ]
    });

    expect(result.status).toBe("PROCESSED_WITH_REJECTIONS");
    expect(result.importedCount).toBe(1);
    expect(result.rejectedCount).toBe(2);
    expect(result.rejectedRows).toEqual([
      { index: 1, serialNo: null, reason: "MALFORMED_SERIAL" },
      { index: 2, serialNo: "MTK1234567902", reason: "INVALID_RECORD" }
    ]);
    expect(repositories.calls.insertSerial).toHaveLength(1);
    expect(repositories.calls.insertSerial[0]).toMatchObject({ serialNo: "MTK1234567901", productId: 9 });
    expect(repositories.calls.markProcessed).toEqual([{ batchId: 101, recordCount: 1 }]);
    expect(repositories.calls.storeRejections.rejections).toEqual(result.rejectedRows);
  });

  test("processes the batch when every record is malformed without throwing", async () => {
    const repositories = createRepositories();
    const service = createImportService({ repositories });

    const result = await service.importProductionBatch({
      externalRef: "SAP-PROD-006",
      source: "SAP",
      receivedBy: "integration_user",
      records: [{ serialNo: "bad", productCode: "SKU" }, "not-an-object"]
    });

    expect(result.status).toBe("PROCESSED_WITH_REJECTIONS");
    expect(result.importedCount).toBe(0);
    expect(result.rejectedCount).toBe(2);
    expect(result.rejectedRows.map((r) => r.reason)).toEqual(["MALFORMED_SERIAL", "MALFORMED_SERIAL"]);
    expect(repositories.calls.insertSerial).toHaveLength(0);
  });

  test("still fails the whole batch on an envelope error", async () => {
    const repositories = createRepositories();
    const service = createImportService({ repositories });

    await expect(
      service.importProductionBatch({
        externalRef: "SAP-PROD-007",
        source: "SAP",
        records: [{ serialNo: "MTK1234567903", productCode: "SKU-VALID" }]
      })
    ).rejects.toThrow("Invalid production import payload");

    expect(repositories.calls.createBatch).toHaveLength(0);
  });

  test("treats duplicate processed batches as idempotent no-ops", async () => {
    const repositories = createRepositories({
      existingBatch: {
        direction: "INBOUND",
        payloadType: "PRODUCTION",
        externalRef: "SAP-PROD-003",
        status: "PROCESSED",
        recordCount: 12
      }
    });
    const service = createImportService({ repositories });

    const result = await service.importProductionBatch({
      externalRef: "SAP-PROD-003",
      source: "SAP",
      receivedBy: "integration_user",
      records: [{ serialNo: "MTK1234567893", productCode: "SKU-VALID" }]
    });

    expect(result.status).toBe("DUPLICATE_IGNORED");
    expect(result.importedCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.rejectedRows).toEqual([]);
    expect(result.sourceLabel).toBe("unknown");
    expect(typeof result.importedAt).toBe("string");
    expect(repositories.calls.createBatch).toHaveLength(0);
    expect(repositories.calls.insertSerial).toHaveLength(0);
  });

  test("treats a concurrently processed batch returned from create as idempotent", async () => {
    const repositories = createRepositories({
      existingBatch: null
    });
    repositories.integrationBatches.createPending = async (batch) => {
      repositories.calls.createBatch.push(batch);
      return {
        batchId: 102,
        ...batch,
        status: "PROCESSED"
      };
    };
    const service = createImportService({ repositories });

    const result = await service.importProductionBatch({
      externalRef: "SAP-PROD-003-RACE",
      source: "SAP",
      receivedBy: "integration_user",
      records: [{ serialNo: "MTK1234567895", productCode: "SKU-VALID" }]
    });

    expect(result.status).toBe("DUPLICATE_IGNORED");
    expect(result.importedCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.rejectedRows).toEqual([]);
    expect(result.sourceLabel).toBe("unknown");
    expect(typeof result.importedAt).toBe("string");
    expect(repositories.calls.transaction).toHaveLength(0);
    expect(repositories.calls.insertSerial).toHaveLength(0);
  });

  test("rolls back imported serial work and marks batch failed when event append fails", async () => {
    const repositories = createRepositories({
      productsByCode: new Map([["SKU-VALID", { productId: 9 }]]),
      appendEventError: new Error("event write failed")
    });
    const service = createImportService({ repositories });

    await expect(
      service.importProductionBatch({
        externalRef: "SAP-PROD-004",
        source: "SAP",
        receivedBy: "integration_user",
        records: [{ serialNo: "MTK1234567894", productCode: "SKU-VALID" }]
      })
    ).rejects.toThrow("event write failed");

    expect(repositories.calls.transaction).toEqual(["begin", "rollback"]);
    expect(repositories.calls.markFailed).toEqual([{ batchId: 101, errorDetail: "event write failed" }]);
    expect(repositories.calls.markProcessed).toHaveLength(0);
  });
});
