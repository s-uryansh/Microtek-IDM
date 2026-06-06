import { describe, expect, test } from "vitest";

import { createValidationService } from "../src/idm06/validationService.js";

function createRepositories(serialByNo = new Map()) {
  const exceptions = [];

  return {
    exceptions,
    serials: {
      async findBySerialNo(serialNo) {
        return serialByNo.get(serialNo) ?? null;
      }
    },
    exceptionsRepo: {
      async createException(exception) {
        exceptions.push(exception);
        return { exceptionId: exceptions.length, ...exception };
      }
    }
  };
}

describe("IDM-06 validation service", () => {
  test("passes a valid in-stock serial in the caller warehouse", async () => {
    const repositories = createRepositories(
      new Map([
        [
          "MTK1234567890",
          {
            serialId: 1,
            serialNo: "MTK1234567890",
            currentStatus: "IN_STOCK",
            currentWarehouseId: 5,
            productId: 7
          }
        ]
      ])
    );
    const service = createValidationService({ repositories });

    const result = await service.validateSerial({
      serialNo: "MTK1234567890",
      contextType: "FOUNDATION",
      warehouseId: 5,
      userId: "operator_1"
    });

    expect(result).toEqual({
      valid: true,
      serial: {
        serialId: 1,
        serialNo: "MTK1234567890",
        currentStatus: "IN_STOCK",
        currentWarehouseId: 5,
        productId: 7
      },
      alert: null,
      exception: null
    });
    expect(repositories.exceptions).toHaveLength(0);
  });

  test("returns an alert and persists NOT_FOUND for unknown serials", async () => {
    const repositories = createRepositories();
    const service = createValidationService({ repositories });

    const result = await service.validateSerial({
      serialNo: "MTK0000000001",
      contextType: "FOUNDATION",
      warehouseId: 5,
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert).toEqual({
      ruleCode: "NOT_FOUND",
      message: "Serial was not found in IDM."
    });
    expect(repositories.exceptions[0]).toMatchObject({
      serialNo: "MTK0000000001",
      ruleCode: "NOT_FOUND",
      contextType: "FOUNDATION",
      raisedBy: "operator_1"
    });
  });

  test("returns an alert and persists WRONG_WAREHOUSE for warehouse mismatch", async () => {
    const repositories = createRepositories(
      new Map([
        [
          "MTK1234567894",
          {
            serialId: 4,
            serialNo: "MTK1234567894",
            currentStatus: "IN_STOCK",
            currentWarehouseId: 8,
            productId: 3
          }
        ]
      ])
    );
    const service = createValidationService({ repositories });

    const result = await service.validateSerial({
      serialNo: "MTK1234567894",
      contextType: "FOUNDATION",
      warehouseId: 5,
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("WRONG_WAREHOUSE");
    expect(repositories.exceptions[0]).toMatchObject({
      ruleCode: "WRONG_WAREHOUSE",
      contextType: "FOUNDATION"
    });
  });

  test("returns an alert and persists ALREADY_DISPATCHED for dispatched serials", async () => {
    const repositories = createRepositories(
      new Map([
        [
          "MTK1234567895",
          {
            serialId: 5,
            serialNo: "MTK1234567895",
            currentStatus: "DISPATCHED",
            currentWarehouseId: 5,
            productId: 3
          }
        ]
      ])
    );
    const service = createValidationService({ repositories });

    const result = await service.validateSerial({
      serialNo: "MTK1234567895",
      contextType: "FOUNDATION",
      warehouseId: 5,
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_DISPATCHED");
    expect(repositories.exceptions[0]).toMatchObject({
      ruleCode: "ALREADY_DISPATCHED"
    });
  });
});
