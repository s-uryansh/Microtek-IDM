import { describe, expect, test } from "vitest";

import { createExceptionCorrectionService } from "../src/idm10/exceptionCorrectionService.js";

function createRepositories({
  exception,
  correctResult,
  findAllResult,
  serial,
  dispatch,
  invoice
} = {}) {
  const calls = {
    findById: [],
    findAll: [],
    correctException: [],
    findBySerialNo: [],
    appendEvent: [],
    findDispatchById: [],
    findInvoiceById: [],
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
    exceptionsRepo: {
      async findById(exceptionId) {
        calls.findById.push(exceptionId);
        if (typeof exception === "function") return exception(exceptionId);
        return exception?.exceptionId === exceptionId ? exception : null;
      },
      async findAll({ status, contextType, warehouseIds, limit, offset }) {
        calls.findAll.push({ status, contextType, warehouseIds, limit, offset });
        return findAllResult ?? { rows: [], total: 0 };
      },
      async correctException({ exceptionId, correctionReason, correctedBy, correctionTxnRef }) {
        calls.correctException.push({ exceptionId, correctionReason, correctedBy, correctionTxnRef });
        if (typeof correctResult === "function") return correctResult({ exceptionId, correctionReason, correctedBy, correctionTxnRef });
        if (correctResult === false) return null;
        return correctResult ?? {
          exceptionId,
          serialNo: exception?.serialNo ?? null,
          ruleCode: exception?.ruleCode ?? "WRONG_SERIAL",
          contextType: exception?.contextType ?? "GRN",
          contextId: exception?.contextId ?? 10,
          status: "CORRECTED",
          raisedAt: "2026-01-02T01:00:00.000Z",
          raisedBy: "operator_1",
          correctedAt: "2026-01-03T10:00:00.000Z",
          correctedBy: correctedBy,
          correctionReason,
          correctionTxnRef: correctionTxnRef ?? null,
          warehouseId: exception?.warehouseId ?? null
        };
      }
    },
    serials: {
      async findBySerialNo(serialNo) {
        calls.findBySerialNo.push(serialNo);
        return serial ?? null;
      },
      async appendSerialEvent(event) {
        calls.appendEvent.push(event);
      }
    },
    dispatches: {
      async findById(dispatchId) {
        calls.findDispatchById.push(dispatchId);
        return dispatch ?? null;
      }
    },
    invoices: {
      async findById(invoiceId) {
        calls.findInvoiceById.push(invoiceId);
        return invoice ?? null;
      }
    }
  };

  return repositories;
}

describe("IDM-10 exception correction service", () => {
  test("T10-01 corrects an OPEN exception and appends CORRECTION event", async () => {
    const exception = {
      exceptionId: 1,
      serialNo: "MTK1234567890",
      ruleCode: "WRONG_SERIAL",
      contextType: "GRN",
      contextId: 10,
      status: "OPEN",
      raisedAt: "2026-01-02T01:00:00.000Z",
      raisedBy: "operator_1"
    };
    const repositories = createRepositories({
      exception,
      serial: { serialId: 50, serialNo: "MTK1234567890" }
    });
    const service = createExceptionCorrectionService({ repositories });

    const result = await service.correctException({
      exceptionId: 1,
      correctionReason: "Verified serial was received at correct warehouse.",
      userId: "supervisor_1"
    });

    expect(result.status).toBe("CORRECTED");
    expect(result.correctedBy).toBe("supervisor_1");
    expect(result.correctionReason).toBe("Verified serial was received at correct warehouse.");
    expect(repositories.calls.correctException).toHaveLength(1);
    expect(repositories.calls.correctException[0]).toMatchObject({
      exceptionId: 1,
      correctionReason: "Verified serial was received at correct warehouse.",
      correctedBy: "supervisor_1"
    });
    expect(repositories.calls.appendEvent[0]).toMatchObject({
      serialId: 50,
      eventType: "CORRECTION",
      referenceType: "EXCEPTION",
      referenceId: 1,
      createdBy: "supervisor_1"
    });
    expect(repositories.calls.transaction).toEqual(["begin", "commit"]);
  });

  test("T10-02 rejects correction without reason", async () => {
    const service = createExceptionCorrectionService({ repositories: createRepositories() });

    await expect(
      service.correctException({ exceptionId: 1, correctionReason: "", userId: "supervisor_1" })
    ).rejects.toThrow("Correction reason is required");
  });

  test("T10-02b rejects correction with missing reason field", async () => {
    const service = createExceptionCorrectionService({ repositories: createRepositories() });

    await expect(
      service.correctException({ exceptionId: 1, userId: "supervisor_1" })
    ).rejects.toThrow("Correction reason is required");
  });

  test("T10-05 rejects correction of already corrected exception", async () => {
    const exception = {
      exceptionId: 2,
      serialNo: "MTK1234567891",
      ruleCode: "WRONG_WAREHOUSE",
      status: "CORRECTED",
      correctedAt: "2026-01-03T10:00:00.000Z",
      correctedBy: "supervisor_1"
    };
    const repositories = createRepositories({ exception });
    const service = createExceptionCorrectionService({ repositories });

    await expect(
      service.correctException({
        exceptionId: 2,
        correctionReason: "Trying to correct again.",
        userId: "supervisor_2"
      })
    ).rejects.toThrow("Exception is already resolved");
    expect(repositories.calls.correctException).toHaveLength(0);
  });

  test("T10-05b rejects correction of dismissed exception", async () => {
    const exception = {
      exceptionId: 3,
      serialNo: "MTK1234567892",
      ruleCode: "EXCESS",
      status: "DISMISSED"
    };
    const repositories = createRepositories({ exception });
    const service = createExceptionCorrectionService({ repositories });

    await expect(
      service.correctException({
        exceptionId: 3,
        correctionReason: "Trying to correct dismissed.",
        userId: "supervisor_1"
      })
    ).rejects.toThrow("Exception is already resolved");
  });

  test("rejects correction of non-existent exception", async () => {
    const repositories = createRepositories({ exception: null });
    const service = createExceptionCorrectionService({ repositories });

    await expect(
      service.correctException({
        exceptionId: 999,
        correctionReason: "This does not exist.",
        userId: "supervisor_1"
      })
    ).rejects.toThrow("Exception not found");
  });

  test("concurrent correction: second request gets 409 conflict", async () => {
    const exception = {
      exceptionId: 4,
      serialNo: "MTK1234567893",
      ruleCode: "SHORT",
      status: "OPEN",
      raisedAt: "2026-01-02T01:00:00.000Z",
      raisedBy: "operator_1"
    };

    const repositories = createRepositories({
      exception,
      correctResult: false,
      serial: { serialId: 51, serialNo: "MTK1234567893" }
    });
    const service = createExceptionCorrectionService({ repositories });

    await expect(
      service.correctException({
        exceptionId: 4,
        correctionReason: "Concurrent correction attempt.",
        userId: "supervisor_2"
      })
    ).rejects.toThrow("Exception was already corrected by another user");
    expect(repositories.calls.transaction).toEqual(["begin", "rollback"]);
  });

  test("skips serial_event when exception has no serial_no", async () => {
    const exception = {
      exceptionId: 5,
      serialNo: null,
      ruleCode: "MALFORMED_SERIAL",
      contextType: "FOUNDATION",
      status: "OPEN",
      raisedAt: "2026-01-02T01:00:00.000Z",
      raisedBy: "operator_1"
    };
    const repositories = createRepositories({ exception });
    const service = createExceptionCorrectionService({ repositories });

    const result = await service.correctException({
      exceptionId: 5,
      correctionReason: "Malformed serial was a data entry error, resolved.",
      userId: "supervisor_1"
    });

    expect(result.status).toBe("CORRECTED");
    expect(repositories.calls.appendEvent).toHaveLength(0);
    expect(repositories.calls.findBySerialNo).toHaveLength(0);
  });

  test("skips serial_event when serial_no exists but serial_master row is gone", async () => {
    const exception = {
      exceptionId: 6,
      serialNo: "ORPHAN-001",
      ruleCode: "NOT_FOUND",
      status: "OPEN",
      raisedAt: "2026-01-02T01:00:00.000Z",
      raisedBy: "operator_1"
    };
    const repositories = createRepositories({
      exception,
      serial: null
    });
    const service = createExceptionCorrectionService({ repositories });

    const result = await service.correctException({
      exceptionId: 6,
      correctionReason: "Serial was manually imported.",
      userId: "supervisor_1"
    });

    expect(result.status).toBe("CORRECTED");
    expect(repositories.calls.findBySerialNo).toEqual(["ORPHAN-001"]);
    expect(repositories.calls.appendEvent).toHaveLength(0);
  });

  test("rejects dispatch exception correction until the related invoice is dispatched", async () => {
    const exception = {
      exceptionId: 7,
      serialNo: "WRONG-SERIAL-001",
      ruleCode: "WRONG_SERIAL",
      contextType: "DISPATCH",
      contextId: 70,
      status: "OPEN",
      raisedAt: "2026-01-02T01:00:00.000Z",
      raisedBy: "operator_1"
    };
    const repositories = createRepositories({
      exception,
      dispatch: { dispatchId: 70, invoiceId: 700, status: "IN_PROGRESS" },
      invoice: { invoiceId: 700, status: "IN_PROGRESS", lines: [] }
    });
    const service = createExceptionCorrectionService({ repositories });

    await expect(
      service.correctException({
        exceptionId: 7,
        correctionReason: "Wrong serial was later fixed.",
        userId: "supervisor_1"
      })
    ).rejects.toThrow("Dispatch exception can only be corrected after the invoice is dispatched");
    expect(repositories.calls.correctException).toHaveLength(0);
    expect(repositories.calls.transaction).toEqual([]);
  });

  test("allows dispatch exception correction after the related invoice is dispatched", async () => {
    const exception = {
      exceptionId: 8,
      serialNo: "WRONG-SERIAL-002",
      ruleCode: "WRONG_SERIAL",
      contextType: "DISPATCH",
      contextId: 80,
      status: "OPEN",
      raisedAt: "2026-01-02T01:00:00.000Z",
      raisedBy: "operator_1"
    };
    const repositories = createRepositories({
      exception,
      dispatch: { dispatchId: 80, invoiceId: 800, status: "DISPATCHED" },
      invoice: { invoiceId: 800, status: "DISPATCHED", lines: [] },
      serial: { serialId: 80, serialNo: "WRONG-SERIAL-002" }
    });
    const service = createExceptionCorrectionService({ repositories });

    const result = await service.correctException({
      exceptionId: 8,
      correctionReason: "Invoice was dispatched after valid serial scan.",
      userId: "supervisor_1"
    });

    expect(result.status).toBe("CORRECTED");
    expect(repositories.calls.findDispatchById).toEqual([80]);
    expect(repositories.calls.findInvoiceById).toEqual([800]);
    expect(repositories.calls.transaction).toEqual(["begin", "commit"]);
  });

  test("lists exceptions with default pagination", async () => {
    const findAllResult = {
      rows: [
        { exceptionId: 1, ruleCode: "WRONG_SERIAL", status: "OPEN" },
        { exceptionId: 2, ruleCode: "SHORT", status: "CORRECTED" }
      ],
      total: 2
    };
    const repositories = createRepositories({ findAllResult });
    const service = createExceptionCorrectionService({ repositories });

    const result = await service.listExceptions({});

    expect(result.exceptions).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(repositories.calls.findAll[0]).toMatchObject({
      status: null,
      contextType: null,
      warehouseIds: null,
      limit: 50,
      offset: 0
    });
  });

  test("lists exceptions with status and warehouse filters", async () => {
    const findAllResult = { rows: [], total: 0 };
    const repositories = createRepositories({ findAllResult });
    const service = createExceptionCorrectionService({ repositories });

    await service.listExceptions({
      status: "OPEN",
      contextType: "GRN",
      warehouseIds: [5, 6],
      page: 2,
      pageSize: 10
    });

    expect(repositories.calls.findAll[0]).toMatchObject({
      status: "OPEN",
      contextType: "GRN",
      warehouseIds: [5, 6],
      limit: 10,
      offset: 10
    });
  });

  test("caps pageSize at 200", async () => {
    const findAllResult = { rows: [], total: 0 };
    const repositories = createRepositories({ findAllResult });
    const service = createExceptionCorrectionService({ repositories });

    await service.listExceptions({ page: 1, pageSize: 500 });

    expect(repositories.calls.findAll[0].limit).toBe(200);
  });

  test("gets a single exception by ID", async () => {
    const exception = { exceptionId: 1, ruleCode: "WRONG_SERIAL", status: "OPEN", warehouseId: 5 };
    const repositories = createRepositories({ exception });
    const service = createExceptionCorrectionService({ repositories });

    const result = await service.getException({ exceptionId: 1 });

    expect(result.exceptionId).toBe(1);
    expect(result.warehouseId).toBe(5);
    expect(repositories.calls.findById).toEqual([1]);
  });

  test("returns null for unknown exception on getException", async () => {
    const repositories = createRepositories({ exception: null });
    const service = createExceptionCorrectionService({ repositories });

    const result = await service.getException({ exceptionId: 999 });

    expect(result).toBeNull();
  });
});
