import { describe, expect, test } from "vitest";

import { createSrnService } from "../src/idm04/srnService.js";

function createRepositories({
  srn,
  dispatchScan,
  alreadyReturned = false,
  conditionValid = true,
  validationResult,
  invoiceDispatched = true
}) {
  const calls = { transaction: [], createException: [], insertScan: [], updateSerial: [], appendEvent: [] };
  const repositories = {
    calls,
    async withTransaction(work) {
      calls.transaction.push("begin");
      const result = await work(repositories);
      calls.transaction.push("commit");
      return result;
    },
    srns: {
      async create(input) {
        return { srnId: 20, status: "PENDING", ...input };
      },
      async invoiceHasDispatchedSerials() {
        return invoiceDispatched;
      },
      async findById(srnId) {
        return srn?.srnId === srnId ? srn : null;
      },
      async lockById(srnId) {
        return srn?.srnId === srnId ? srn : null;
      },
      async findOriginalDispatchScan(serialId) {
        return dispatchScan?.serialId === serialId ? dispatchScan : null;
      },
      async hasReturnedSerial() {
        return alreadyReturned;
      },
      async insertScan(input) {
        calls.insertScan.push(input);
        return { srnScanId: calls.insertScan.length, ...input };
      }
    },
    serials: {
      async updateReceipt(serialId, warehouseId, receivedBy) {
        calls.updateSerial.push({ serialId, warehouseId, receivedBy });
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
  return { repositories, conditionTagService: { isAllowed: () => conditionValid } };
}

describe("IDM-04 SRN service", () => {
  test("createSrn rejects an invoice that was never dispatched", async () => {
    const { repositories, conditionTagService } = createRepositories({ invoiceDispatched: false });
    const service = createSrnService({ repositories, conditionTagService });

    await expect(
      service.createSrn({ receivingWarehouseId: 5, invoiceId: 10, returnProductIds: [], userId: "operator_1" })
    ).rejects.toMatchObject({ status: 409, code: "INVOICE_NOT_DISPATCHED" });
  });

  test("createSrn allows an invoice that has dispatched serials", async () => {
    const { repositories, conditionTagService } = createRepositories({ invoiceDispatched: true });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.createSrn({
      receivingWarehouseId: 5,
      invoiceId: 10,
      returnProductIds: [7],
      userId: "operator_1"
    });

    expect(result).toMatchObject({ srnId: 20, invoiceId: 10 });
  });

  test("T04-01 returns a dispatched serial to stock and writes an SRN event", async () => {
    const { repositories, conditionTagService } = createRepositories({
      srn: { srnId: 20, receivingWarehouseId: 5, invoiceId: 10 },
      dispatchScan: { dispatchScanId: 1, serialId: 7, invoiceId: 10 },
      validationResult: { valid: true, serial: { serialId: 7, serialNo: "MTK1234567890" } }
    });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
    expect(repositories.calls.updateSerial).toEqual([{ serialId: 7, warehouseId: 5, receivedBy: "operator_1" }]);
    expect(repositories.calls.appendEvent[0]).toMatchObject({ eventType: "SRN", referenceType: "SRN", referenceId: 20 });
  });

  test("T04-02 rejects returns without original dispatch", async () => {
    const { repositories, conditionTagService } = createRepositories({
      srn: { srnId: 20, receivingWarehouseId: 5, invoiceId: 10 },
      dispatchScan: null,
      validationResult: { valid: true, serial: { serialId: 7, serialNo: "MTK1234567890" } }
    });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("NO_ORIGINAL_DISPATCH");
  });

  test("T04-03 blocks duplicate returns", async () => {
    const { repositories, conditionTagService } = createRepositories({
      srn: { srnId: 20, receivingWarehouseId: 5, invoiceId: 10 },
      dispatchScan: { dispatchScanId: 1, serialId: 7, invoiceId: 10 },
      alreadyReturned: true,
      validationResult: { valid: true, serial: { serialId: 7, serialNo: "MTK1234567890" } }
    });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("ALREADY_RETURNED");
  });

  test("T04-04 rejects serial not on the SRN's invoice", async () => {
    const { repositories, conditionTagService } = createRepositories({
      srn: { srnId: 20, receivingWarehouseId: 5, invoiceId: 10 },
      dispatchScan: { dispatchScanId: 1, serialId: 7, invoiceId: 99 },
      validationResult: { valid: true, serial: { serialId: 7, serialNo: "MTK1234567890" } }
    });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(false);
    expect(result.alert.ruleCode).toBe("WRONG_INVOICE_SERIAL");
    expect(result.alert.message).toBe("Serial was not on the invoice being returned.");
  });

  test("T04-05 accepts a dispatched serial regardless of the operator's selected product list", async () => {
    // The return is validated against what was dispatched on the invoice, not
    // against the operator's product selection, so a dispatched serial whose
    // product is not in the selected list is still accepted.
    const { repositories, conditionTagService } = createRepositories({
      srn: { srnId: 20, receivingWarehouseId: 5, invoiceId: 10, returnProductIds: [100, 101] },
      dispatchScan: { dispatchScanId: 1, serialId: 7, invoiceId: 10 },
      validationResult: { valid: true, serial: { serialId: 7, serialNo: "MTK1234567890", productId: 200 } }
    });
    const service = createSrnService({ repositories, conditionTagService });

    const result = await service.scanReturn({
      srnId: 20,
      serialNo: "MTK1234567890",
      conditionTag: "SALEABLE",
      userId: "operator_1"
    });

    expect(result.valid).toBe(true);
  });
});
