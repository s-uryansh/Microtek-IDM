import { describe, expect, test } from "vitest";

import { createBatteryPreBillingService } from "../src/idm03/batteryPreBillingService.js";

function createRepositories({
  invoice,
  invoiceLine,
  serial,
  existingCommit,
  validationResult
} = {}) {
  const calls = {
    findInvoiceById: [],
    findInvoiceLine: [],
    findSerial: [],
    validate: [],
    findCommitBySerial: [],
    insertCommit: [],
    appendEvent: [],
    countCommitsForInvoice: [],
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
        calls.findInvoiceById.push(invoiceId);
        if (typeof invoice === "function") return invoice(invoiceId);
        return invoice?.invoiceId === invoiceId ? invoice : null;
      },
      async findLineById(invoiceLineId) {
        calls.findInvoiceLine.push(invoiceLineId);
        if (typeof invoiceLine === "function") return invoiceLine(invoiceLineId);
        return invoiceLine?.invoiceLineId === invoiceLineId ? invoiceLine : null;
      }
    },
    serials: {
      async findBySerialNo(serialNo) {
        calls.findSerial.push(serialNo);
        return serial ?? null;
      },
      async appendSerialEvent(event) {
        calls.appendEvent.push(event);
      }
    },
    validationService: {
      async validateSerial(input) {
        calls.validate.push(input);
        return validationResult ?? { valid: true, serial: { serialId: 1, serialNo: input.serialNo } };
      }
    },
    batteryPreBilling: {
      async findCommitBySerial(serialId) {
        calls.findCommitBySerial.push(serialId);
        return existingCommit?.serialId === serialId ? existingCommit : null;
      },
      async insertCommit({ invoiceLineId, serialId, committedBy }) {
        calls.insertCommit.push({ invoiceLineId, serialId, committedBy });
        return { batteryPreBillingId: 1 };
      },
      async countCommitsForInvoice(invoiceId) {
        calls.countCommitsForInvoice.push(invoiceId);
        return 2;
      }
    }
  };

  return repositories;
}

describe("IDM-03 battery pre-billing service", () => {
  test("T03-01 commits a valid battery serial to an invoice line", async () => {
    const repositories = createRepositories({
      invoiceLine: {
        invoiceLineId: 10,
        invoiceId: 100,
        productId: 7,
        quantity: 5,
        isBattery: true,
        warehouseId: 3
      },
      invoice: {
        invoiceId: 100,
        warehouseId: 3,
        status: "PENDING",
        lines: [
          { invoiceLineId: 10, productId: 7, quantity: 5 }
        ]
      },
      serial: {
        serialId: 50,
        serialNo: "MTK-BAT-001",
        productId: 7,
        currentStatus: "IN_STOCK",
        currentWarehouseId: 3
      },
      validationResult: {
        valid: true,
        serial: { serialId: 50, serialNo: "MTK-BAT-001", productId: 7, currentStatus: "IN_STOCK", currentWarehouseId: 3 },
        alert: null,
        exception: null
      }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceLineId: 10,
      serialNo: "MTK-BAT-001",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
    expect(result.status).toBe("COMMITTED");
    expect(repositories.calls.insertCommit).toHaveLength(1);
    expect(repositories.calls.insertCommit[0]).toMatchObject({
      invoiceLineId: 10,
      serialId: 50,
      committedBy: "operator_1"
    });
    expect(repositories.calls.appendEvent[0]).toMatchObject({
      serialId: 50,
      eventType: "PRE_BILLING",
      referenceType: "INVOICE_LINE",
      referenceId: 10,
      createdBy: "operator_1"
    });
    expect(repositories.calls.transaction).toEqual(["begin", "commit"]);
  });

  test("T03-02 rejects serial when invoice line product is not battery", async () => {
    const repositories = createRepositories({
      invoiceLine: {
        invoiceLineId: 10,
        invoiceId: 100,
        productId: 8,
        quantity: 5,
        isBattery: false
      },
      serial: { serialId: 50, serialNo: "MTK-BAT-001", productId: 8, currentStatus: "IN_STOCK" }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceLineId: 10,
      serialNo: "MTK-BAT-001",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("NOT_BATTERY_LINE");
  });

  test("T03-03 rejects when serial product does not match invoice line product", async () => {
    const repositories = createRepositories({
      invoiceLine: {
        invoiceLineId: 10,
        invoiceId: 100,
        productId: 7,
        quantity: 5,
        isBattery: true
      },
      invoice: { invoiceId: 100, warehouseId: 3, lines: [{ invoiceLineId: 10, productId: 7, quantity: 5 }] },
      serial: {
        serialId: 50,
        serialNo: "MTK-INV-001",
        productId: 8,
        currentStatus: "IN_STOCK",
        currentWarehouseId: 3
      },
      validationResult: {
        valid: false,
        serial: null,
        alert: { ruleCode: "PRODUCT_INVOICE_MISMATCH", message: "Serial product does not match the invoice line." },
        exception: null
      }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceLineId: 10,
      serialNo: "MTK-INV-001",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("PRODUCT_INVOICE_MISMATCH");
  });

  test("T03-04 rejects serial already committed to another invoice line", async () => {
    const repositories = createRepositories({
      invoiceLine: {
        invoiceLineId: 10,
        invoiceId: 100,
        productId: 7,
        quantity: 5,
        isBattery: true
      },
      invoice: { invoiceId: 100, warehouseId: 3, lines: [{ invoiceLineId: 10, productId: 7, quantity: 5 }] },
      serial: {
        serialId: 50,
        serialNo: "MTK-BAT-001",
        productId: 7,
        currentStatus: "IN_STOCK",
        currentWarehouseId: 3
      },
      existingCommit: { serialId: 50, invoiceLineId: 99 },
      validationResult: {
        valid: true,
        serial: { serialId: 50, serialNo: "MTK-BAT-001", productId: 7, currentStatus: "IN_STOCK", currentWarehouseId: 3 },
        alert: null,
        exception: null
      }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceLineId: 10,
      serialNo: "MTK-BAT-001",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_COMMITTED");
  });

  test("rejects serial that is already dispatched", async () => {
    const repositories = createRepositories({
      invoiceLine: {
        invoiceLineId: 10,
        invoiceId: 100,
        productId: 7,
        quantity: 5,
        isBattery: true,
        warehouseId: 3
      },
      serial: { serialId: 50, serialNo: "MTK-BAT-001", productId: 7, currentStatus: "DISPATCHED" },
      validationResult: {
        valid: false,
        serial: null,
        alert: { ruleCode: "ALREADY_DISPATCHED", message: "Serial has already been dispatched." },
        exception: { exceptionId: 1 }
      }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.commitSerial({
      invoiceLineId: 10,
      serialNo: "MTK-BAT-001",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
  });

  test("rejects commit when invoice line not found", async () => {
    const repositories = createRepositories({ invoiceLine: null });
    const service = createBatteryPreBillingService({ repositories });

    await expect(
      service.commitSerial({ invoiceLineId: 999, serialNo: "MTK-BAT-001", userId: "operator_1" })
    ).rejects.toThrow("Invoice line not found");
  });

  test("returns committed count for invoice", async () => {
    const repositories = createRepositories({
      invoice: {
        invoiceId: 100,
        warehouseId: 3,
        lines: [{ invoiceLineId: 10, productId: 7, quantity: 5 }]
      }
    });
    const service = createBatteryPreBillingService({ repositories });

    const result = await service.getCommitStatus({ invoiceId: 100 });

    expect(result.invoiceId).toBe(100);
    expect(repositories.calls.countCommitsForInvoice).toEqual([100]);
  });
});
