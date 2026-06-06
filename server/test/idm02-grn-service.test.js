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
      async findMissingExpectedLines() {
        return [
          { serialId: 1, serialNo: "MTKSHORT0001" },
          { serialId: 2, serialNo: "MTKSHORT0002" }
        ];
      },
      async markShort(input) {
        calls.markShort.push(input);
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
      expectedLine: { serialId: 7 },
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

  test("T02-02 completion creates short exceptions for missing expected serials", async () => {
    const repositories = createRepositories({
      grn: { grnId: 10, receivingWarehouseId: 5, status: "IN_PROGRESS" },
      validationResult: null
    });
    const service = createGrnService({ repositories });

    const result = await service.completeGrn({ grnId: 10, userId: "operator_1" });

    expect(result.status).toBe("EXCEPTION");
    expect(result.summary.short).toBe(2);
    expect(repositories.calls.createException.map((call) => call.ruleCode)).toEqual(["SHORT", "SHORT"]);
  });
});
