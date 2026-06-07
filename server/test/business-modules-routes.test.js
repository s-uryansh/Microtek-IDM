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

describe("IDM-02, IDM-04, and IDM-09 route authorization", () => {
  test("denies GRN scan outside stored warehouse scope", async () => {
    const app = createApp({
      config,
      services: {
        grnService: {
          async getGrnWarehouseId() {
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
      url: "/api/idm-02/grns/10/scans",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "4"
      },
      body: { serialNo: "MTK1234567890" }
    });

    expect(response.status).toBe(403);
  });

  test("allows GRN scan when stored warehouse id is returned as a string", async () => {
    const app = createApp({
      config,
      services: {
        grnService: {
          async getGrnWarehouseId() {
            return "5";
          },
          async scanSerial() {
            return { valid: true, matchStatus: "MATCHED" };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-02/grns/10/scans",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "5"
      },
      body: { serialNo: "MTK1234567890" }
    });

    expect(response.status).toBe(201);
  });

  test("denies SRN scan outside stored warehouse scope", async () => {
    const app = createApp({
      config,
      services: {
        srnService: {
          async getSrnWarehouseId() {
            return 5;
          },
          async scanReturn() {
            throw new Error("service should not be called");
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-04/srns/20/scans",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "4"
      },
      body: { serialNo: "MTK1234567890", conditionTag: "SALEABLE" }
    });

    expect(response.status).toBe(403);
  });

  test("allows SRN scan when stored warehouse id is returned as a string", async () => {
    const app = createApp({
      config,
      services: {
        srnService: {
          async getSrnWarehouseId() {
            return "5";
          },
          async scanReturn() {
            return { valid: true, returnScan: { srnScanId: 1 } };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "POST",
      url: "/api/idm-04/srns/20/scans",
      headers: {
        "x-user-id": "operator_1",
        "x-user-role": "warehouse_operator",
        "x-warehouse-ids": "5"
      },
      body: { serialNo: "MTK1234567890", conditionTag: "SALEABLE" }
    });

    expect(response.status).toBe(201);
  });

  test("returns serial history for authorized supervisors", async () => {
    const app = createApp({
      config,
      services: {
        serialHistoryService: {
          async getSerialHistory({ serialNo }) {
            return { found: true, serial: { serialNo }, timeline: [{ type: "EVENT", eventType: "PRODUCTION" }] };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-09/serials/MTK1234567890/history",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.timeline).toEqual([{ type: "EVENT", eventType: "PRODUCTION" }]);
  });
});
