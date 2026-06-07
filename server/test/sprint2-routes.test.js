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

describe("Sprint 2 API authorization", () => {
  test("denies dispatch start without authentication", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-05/dispatches",
      body: { invoiceId: 100, warehouseId: 5 }
    });

    expect(response.status).toBe(401);
  });

  test("denies dispatch start outside caller warehouse scope", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-05/dispatches",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "4"
      },
      body: { invoiceId: 100, warehouseId: 5 }
    });

    expect(response.status).toBe(403);
  });

  test("starts dispatch through injected services for authorized users", async () => {
    const app = createApp({
      config,
      services: {
        dispatchService: {
          async startDispatch(input) {
            return { dispatchId: 10, status: "PENDING", ...input };
          }
        },
        fulfilmentStatusService: {
          async getInvoiceStatus() {
            return { invoiceId: 100, status: "PENDING", requiredQuantity: 1, scannedQuantity: 0 };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-05/dispatches",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "5"
      },
      body: { invoiceId: 100, warehouseId: 5 }
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      dispatchId: 10,
      invoiceId: 100,
      warehouseId: 5,
      status: "PENDING"
    });
  });

  test("returns 404 when dispatch start targets an unknown invoice", async () => {
    const app = createApp({
      config,
      services: {
        dispatchService: {
          async startDispatch() {
            throw Object.assign(new Error("Invoice not found"), { status: 404 });
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-05/dispatches",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "5"
      },
      body: { invoiceId: 999, warehouseId: 5 }
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Invoice not found"
      }
    });
  });

  test("denies dispatch scan outside caller warehouse scope", async () => {
    const app = createApp({
      config,
      services: {
        dispatchService: {
          async getDispatchWarehouseId(dispatchId) {
            expect(dispatchId).toBe(10);
            return 5;
          },
          async scanSerial() {
            throw new Error("service should not be called");
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-05/dispatches/10/scans",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "4"
      },
      body: { invoiceLineId: 200, serialNo: "MTK1234567890" }
    });

    expect(response.status).toBe(403);
  });

  test("allows dispatch scan when stored warehouse id is returned as a string", async () => {
    const app = createApp({
      config,
      services: {
        dispatchService: {
          async getDispatchWarehouseId(dispatchId) {
            expect(dispatchId).toBe(10);
            return "5";
          },
          async scanSerial() {
            return { valid: true, scan: { dispatchScanId: 1 } };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-05/dispatches/10/scans",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "5"
      },
      body: { invoiceLineId: 200, serialNo: "MTK1234567890" }
    });

    expect(response.status).toBe(201);
  });

  test("denies dispatch completion outside caller warehouse scope", async () => {
    const app = createApp({
      config,
      services: {
        dispatchService: {
          async getDispatchWarehouseId(dispatchId) {
            expect(dispatchId).toBe(10);
            return 5;
          },
          async completeDispatch() {
            throw new Error("service should not be called");
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-05/dispatches/10/complete",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "4"
      },
      body: {}
    });

    expect(response.status).toBe(403);
  });
});
