import { createRequest, createResponse } from "node-mocks-http";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";

const config = {
  nodeEnv: "test",
  port: 4100,
  databaseUrl: "postgres://user:pass@localhost:5432/microtek_idm_test",
  corsOrigin: "http://localhost:5173",
  logLevel: "silent"
};

async function inject(app, { method, url, body, headers = {} }) {
  const request = createRequest({ method, url, body, headers });
  const response = createResponse();
  app.handle(request, response);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    status: response.statusCode,
    body: response._getData() ? response._getJSONData() : null
  };
}

function createCorrectionService({ listResult, correctResult, getResult } = {}) {
  const calls = { list: [], correct: [], get: [] };
  const service = {
    calls,
    async listExceptions(params) {
      calls.list.push(params);
      return listResult ?? { exceptions: [], total: 0, page: 1, pageSize: 50 };
    },
    async correctException(params) {
      calls.correct.push(params);
      if (typeof correctResult === "function") return correctResult(params);
      if (correctResult === "NOT_FOUND") throw new Error("Exception not found");
      if (correctResult === "ALREADY_RESOLVED") throw new Error("Exception is already resolved");
      if (correctResult === "CONCURRENT") throw new Error("Exception was already corrected by another user");
      if (correctResult === "DISPATCH_NOT_DISPATCHED") {
        throw new Error("Dispatch exception can only be corrected after the invoice is dispatched");
      }
      return correctResult ?? {
        exceptionId: params.exceptionId,
        status: "CORRECTED",
        correctedBy: params.userId,
        correctionReason: params.correctionReason
      };
    },
    async getException(params) {
      calls.get.push(params);
      if (typeof getResult === "function") return getResult(params);
      if (getResult === null) return null;
      return getResult ?? { exceptionId: params.exceptionId, ruleCode: "WRONG_SERIAL", status: "OPEN", warehouseId: 5 };
    }
  };
  return service;
}

describe("IDM-10 exception correction route authorization", () => {
  test("T10-03 denies correction by warehouse_operator", async () => {
    const correctionService = createCorrectionService();
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "5"
      },
      body: { correctionReason: "This should be denied." }
    });

    expect(response.status).toBe(403);
    expect(correctionService.calls.correct).toHaveLength(0);
  });

  test("allows correction by admin", async () => {
    const correctionService = createCorrectionService();
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "admin_1",
        "x-user-role": "admin",
        "x-warehouse-ids": "1,2,3"
      },
      body: { correctionReason: "Verified and resolved." }
    });

    expect(response.status).toBe(200);
    expect(correctionService.calls.correct).toHaveLength(1);
    expect(correctionService.calls.correct[0]).toMatchObject({
      exceptionId: 1,
      correctionReason: "Verified and resolved.",
      userId: "admin_1"
    });
  });

  test("allows correction by supervisor in scope", async () => {
    const correctionService = createCorrectionService();
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      },
      body: { correctionReason: "Verified and resolved by supervisor." }
    });

    expect(response.status).toBe(200);
  });

  test("allows supervisor access when the resolved warehouse id is a bigint string", async () => {
    const correctionService = createCorrectionService({
      getResult: { exceptionId: 1, ruleCode: "WRONG_SERIAL", status: "OPEN", warehouseId: "5" }
    });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions/1",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ exceptionId: 1, warehouseId: "5" });
  });

  test("denies correction by supervisor out of warehouse scope", async () => {
    const correctionService = createCorrectionService({
      getResult: { exceptionId: 1, ruleCode: "WRONG_SERIAL", status: "OPEN", warehouseId: 10 }
    });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      },
      body: { correctionReason: "This is not my warehouse." }
    });

    expect(response.status).toBe(403);
    expect(correctionService.calls.correct).toHaveLength(0);
  });

  test("denies correction without authentication", async () => {
    const correctionService = createCorrectionService();
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      body: { correctionReason: "No auth." }
    });

    expect(response.status).toBe(401);
    expect(correctionService.calls.correct).toHaveLength(0);
  });

  test("returns 404 when correcting non-existent exception", async () => {
    const correctionService = createCorrectionService({
      correctResult: "NOT_FOUND",
      getResult: null
    });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/999/correct",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      },
      body: { correctionReason: "Trying to correct non-existent." }
    });

    expect(response.status).toBe(404);
  });

  test("returns 409 when correcting already resolved exception", async () => {
    const correctionService = createCorrectionService({ correctResult: "ALREADY_RESOLVED" });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      },
      body: { correctionReason: "Already done." }
    });

    expect(response.status).toBe(409);
  });

  test("returns 409 on concurrent correction", async () => {
    const correctionService = createCorrectionService({ correctResult: "CONCURRENT" });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      },
      body: { correctionReason: "Race condition test." }
    });

    expect(response.status).toBe(409);
  });

  test("returns 409 when correcting a dispatch exception before invoice dispatch", async () => {
    const correctionService = createCorrectionService({ correctResult: "DISPATCH_NOT_DISPATCHED" });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      },
      body: { correctionReason: "Invoice not dispatched yet." }
    });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe("Dispatch exception can only be corrected after the invoice is dispatched");
  });

  test("returns 400 when correction reason is missing", async () => {
    const correctionService = createCorrectionService({ correctResult: "NOT_FOUND" });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-10/exceptions/1/correct",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      },
      body: {}
    });

    expect(response.status).toBe(400);
  });

  test("lists exceptions with warehouse scope for supervisor", async () => {
    const correctionService = createCorrectionService({
      listResult: {
        exceptions: [{ exceptionId: 1, ruleCode: "WRONG_SERIAL", status: "OPEN", warehouseId: 5 }],
        total: 1,
        page: 1,
        pageSize: 50
      }
    });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.exceptions).toHaveLength(1);
    expect(correctionService.calls.list).toHaveLength(1);
    expect(correctionService.calls.list[0].warehouseIds).toEqual([5]);
  });

  test("lists all exceptions without warehouse filter for admin", async () => {
    const correctionService = createCorrectionService();
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions",
      headers: {
        "x-user-id": "admin_1",
        "x-user-role": "admin",
        "x-warehouse-ids": "1,2,3"
      }
    });

    expect(correctionService.calls.list[0].warehouseIds).toBeNull();
  });

  test("denies exception listing to unauthenticated user", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions"
    });

    expect(response.status).toBe(401);
  });

  test("GET /:exceptionId returns exception for supervisor in scope", async () => {
    const correctionService = createCorrectionService();
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions/1",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.exceptionId).toBe(1);
  });

  test("GET /:exceptionId denies supervisor out of warehouse scope", async () => {
    const correctionService = createCorrectionService({
      getResult: { exceptionId: 1, ruleCode: "WRONG_SERIAL", status: "OPEN", warehouseId: 10 }
    });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions/1",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(403);
  });

  test("GET /:exceptionId with null warehouseId is visible to admin", async () => {
    const correctionService = createCorrectionService({
      getResult: { exceptionId: 1, ruleCode: "IMPORT_FAILED", status: "OPEN", warehouseId: null }
    });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions/1",
      headers: {
        "x-user-id": "admin_1",
        "x-user-role": "admin",
        "x-warehouse-ids": "1,2,3"
      }
    });

    expect(response.status).toBe(200);
  });

  test("GET /:exceptionId with null warehouseId denied to supervisor", async () => {
    const correctionService = createCorrectionService({
      getResult: { exceptionId: 1, ruleCode: "IMPORT_FAILED", status: "OPEN", warehouseId: null }
    });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions/1",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(403);
  });

  test("GET /:exceptionId returns 404 for non-existent exception", async () => {
    const correctionService = createCorrectionService({ getResult: null });
    const app = createApp({
      config,
      services: {
        exceptionCorrectionService: correctionService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions/999",
      headers: {
        "x-user-id": "admin_1",
        "x-user-role": "admin",
        "x-warehouse-ids": "1"
      }
    });

    expect(response.status).toBe(404);
  });

  test("GET /:exceptionId returns 404 for invalid ID", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-10/exceptions/abc",
      headers: {
        "x-user-id": "admin_1",
        "x-user-role": "admin",
        "x-warehouse-ids": "1"
      }
    });

    expect(response.status).toBe(404);
  });
});
