import { describe, expect, test } from "vitest";

import { createBatteryPreBillingService } from "../src/idm03/batteryPreBillingService.js";

function createRepositories({
  invoice = { invoiceId: 100, status: "PENDING" },
  batteryLine = { invoiceLineId: 10, productId: 7 },
  existingCommit = null,
  validationResult,
  invoiceWarehouseId
} = {}) {
  const calls = { insertCommit: [], appendEvent: [], createException: [], transaction: [] };

  const repositories = {
    calls,
    async withTransaction(work) {
      calls.transaction.push("begin");
      const result = await work(repositories);
      calls.transaction.push("commit");
      return result;
    },
    invoices: {
      async findById(invoiceId) {
        return invoice?.invoiceId === invoiceId ? invoice : null;
      }
    },
    validationService: {
      async validateSerial(input) {
        calls.validate = input;
        return validationResult ?? {
          valid: true,
          serial: { serialId: 50, serialNo: input.serialNo, productId: 7, currentWarehouseId: 3 }
        };
      }
    },
    batteryPreBilling: {
      async findBatteryLine() {
        return batteryLine;
      },
      async findCommitBySerial(serialId) {
        return existingCommit?.serialId === serialId ? existingCommit : null;
      },
      async insertCommit(input) {
        calls.insertCommit.push(input);
        return { batteryPreBillingId: 1 };
      },
      async countCommitsForInvoice() {
        return 2;
      }
    },
    serials: {
      async appendSerialEvent(event) {
        calls.appendEvent.push(event);
      }
    },
    exceptionsRepo: {
      async createException(input) {
        calls.createException.push(input);
        return { exceptionId: calls.createException.length, ruleCode: input.ruleCode, status: "OPEN" };
      }
    }
  };

  // invoiceWarehouseId is unused now; kept for signature compatibility.
  void invoiceWarehouseId;
  return repositories;
}

describe("IDM-03 battery pre-billing service", () => {
  test("commits a battery serial resolved to the invoice's battery line", async () => {
    const repositories = createRepositories();
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceId: 100,
      serialNo: "EB100-0001",
      userId: "operator_1",
      userWarehouseIds: [3]
    });

    expect(result.valid).toBe(true);
    expect(result.status).toBe("COMMITTED");
    expect(repositories.calls.insertCommit[0]).toMatchObject({ invoiceLineId: 10, serialId: 50, committedBy: "operator_1" });
    expect(repositories.calls.appendEvent[0]).toMatchObject({ eventType: "PRE_BILLING", referenceId: 10 });
  });

  test("rejects when the serial's product is not a battery line on the invoice", async () => {
    const repositories = createRepositories({ batteryLine: null });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceId: 100,
      serialNo: "MTK-SOL300-0001",
      userId: "operator_1",
      userWarehouseIds: [3]
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("NOT_BATTERY_LINE");
    expect(repositories.calls.insertCommit).toHaveLength(0);
  });

  test("rejects a serial that lives outside the operator's warehouses", async () => {
    const repositories = createRepositories({
      validationResult: {
        valid: true,
        serial: { serialId: 50, serialNo: "EB100-0001", productId: 7, currentWarehouseId: 9 }
      }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceId: 100,
      serialNo: "EB100-0001",
      userId: "operator_1",
      userWarehouseIds: [3]
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("WRONG_WAREHOUSE");
    expect(repositories.calls.createException[0]).toMatchObject({ ruleCode: "WRONG_WAREHOUSE", warehouseId: 9 });
  });

  test("rejects a serial already committed", async () => {
    const repositories = createRepositories({ existingCommit: { serialId: 50, invoiceLineId: 99 } });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceId: 100,
      serialNo: "EB100-0001",
      userId: "operator_1",
      userWarehouseIds: [3]
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_COMMITTED");
  });

  test("returns invalid validation result unchanged (e.g. already dispatched)", async () => {
    const repositories = createRepositories({
      validationResult: { valid: false, alert: { ruleCode: "ALREADY_DISPATCHED", message: "x" }, exception: { exceptionId: 1 } }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({ invoiceId: 100, serialNo: "EB100-0001", userId: "u", userWarehouseIds: [3] });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_DISPATCHED");
  });

  test("throws when the invoice is not found", async () => {
    const repositories = createRepositories({ invoice: null });
    const service = createBatteryPreBillingService({ repositories });

    await expect(
      service.commitSerial({ invoiceId: 999, serialNo: "EB100-0001", userId: "u", userWarehouseIds: [3] })
    ).rejects.toThrow("Invoice not found");
  });

  test("returns committed count for an invoice", async () => {
    const repositories = createRepositories();
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.getCommitStatus({ invoiceId: 100 });

    expect(result).toMatchObject({ invoiceId: 100, committedQuantity: 2 });
  });
});
