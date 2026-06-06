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
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  return {
    status: response.statusCode,
    body: response._getData() ? response._getJSONData() : null
  };
}

describe("Sprint 1 API routes", () => {
  test("denies import requests without an authenticated context", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-01/import/production",
      body: {}
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required"
      }
    });
  });

  test("runs validation through injected services for authorized users", async () => {
    const app = createApp({
      config,
      services: {
        validationService: {
          async validateSerial(request) {
            return {
              valid: true,
              serial: {
                serialId: 1,
                serialNo: request.serialNo,
                currentStatus: "IN_STOCK",
                currentWarehouseId: request.warehouseId,
                productId: 2
              },
              alert: null,
              exception: null
            };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-06/validate",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "5"
      },
      body: {
        serialNo: "MTK1234567890",
        contextType: "FOUNDATION",
        warehouseId: 5
      }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      valid: true,
      serial: {
        serialId: 1,
        serialNo: "MTK1234567890",
        currentStatus: "IN_STOCK",
        currentWarehouseId: 5,
        productId: 2
      },
      alert: null,
      exception: null
    });
  });
});
