import { describe, expect, test } from "vitest";

import { createImportService } from "../src/idm01/importService.js";

function createRepositories({ productsByCode = new Map(), existingBatch = null, appendEventError = null } = {}) {
  const calls = {
    createBatch: [],
    markProcessed: [],
    markFailed: [],
    insertSerial: [],
    appendEvent: [],
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
      }
    },
    serials: {
      async findProductByCode(productCode) {
        return productsByCode.get(productCode) ?? null;
      },
      async insertProductionSerial(serial) {
        calls.insertSerial.push(serial);
        return {
          serialId: calls.insertSerial.length,
          serialNo: serial.serialNo,
          currentWarehouseId: serial.currentWarehouseId
        };
      },
      async appendSerialEvent(event) {
        if (appendEventError) {
          throw appendEventError;
        }
        calls.appendEvent.push(event);
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

    expect(result).toEqual({
      status: "PROCESSED",
      importedCount: 1,
      rejectedCount: 0,
      rejections: []
    });
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
    expect(result.rejections).toEqual([
      {
        index: 1,
        serialNo: "MTK1234567892",
        reason: "UNKNOWN_PRODUCT"
      }
    ]);
    expect(repositories.calls.markProcessed).toEqual([{ batchId: 101, recordCount: 1 }]);
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

    expect(result).toEqual({
      status: "DUPLICATE_IGNORED",
      importedCount: 0,
      rejectedCount: 0,
      rejections: []
    });
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

    expect(result).toEqual({
      status: "DUPLICATE_IGNORED",
      importedCount: 0,
      rejectedCount: 0,
      rejections: []
    });
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
