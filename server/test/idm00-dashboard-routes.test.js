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

async function inject(app, { method = "GET", url, headers = {} }) {
  const request = createRequest({ method, url, headers });
  const response = createResponse();
  app.handle(request, response);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    status: response.statusCode,
    body: response._getData() ? response._getJSONData() : null
  };
}

// Capture the warehouseIds the route resolves and hands to the service.
function appWithCapturedScope() {
  const captured = {};
  const app = createApp({
    config,
    services: {
      dashboardService: {
        async getSummary({ warehouseIds }) {
          captured.warehouseIds = warehouseIds;
          return { kpis: {}, asOf: "2026-01-01T00:00:00.000Z" };
        }
      }
    }
  });
  return { app, captured };
}

const ADMIN = { "x-user-id": "admin_1", "x-user-role": "admin", "x-warehouse-ids": "" };
const OPERATOR = { "x-user-id": "operator_1", "x-user-role": "warehouse_operator", "x-warehouse-ids": "3" };

describe("IDM-00 dashboard summary route", () => {
  test("admin with no filter sees all warehouses (empty scope)", async () => {
    const { app, captured } = appWithCapturedScope();

    const res = await inject(app, { url: "/api/idm-00/dashboard/summary", headers: ADMIN });

    expect(res.status).toBe(200);
    expect(captured.warehouseIds).toEqual([]);
  });

  test("admin can filter to a single warehouse", async () => {
    const { app, captured } = appWithCapturedScope();

    const res = await inject(app, { url: "/api/idm-00/dashboard/summary?warehouseId=4", headers: ADMIN });

    expect(res.status).toBe(200);
    expect(captured.warehouseIds).toEqual([4]);
  });

  test("admin gets 400 for a non-numeric warehouseId", async () => {
    const { app } = appWithCapturedScope();

    const res = await inject(app, { url: "/api/idm-00/dashboard/summary?warehouseId=abc", headers: ADMIN });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("non-admin is scoped to their assigned warehouses by default", async () => {
    const { app, captured } = appWithCapturedScope();

    const res = await inject(app, { url: "/api/idm-00/dashboard/summary", headers: OPERATOR });

    expect(res.status).toBe(200);
    expect(captured.warehouseIds).toEqual([3]);
  });

  test("non-admin may narrow to a warehouse they are assigned to", async () => {
    const { app, captured } = appWithCapturedScope();

    const res = await inject(app, { url: "/api/idm-00/dashboard/summary?warehouseId=3", headers: OPERATOR });

    expect(res.status).toBe(200);
    expect(captured.warehouseIds).toEqual([3]);
  });

  test("non-admin is forbidden from a warehouse they are not assigned to", async () => {
    const { app, captured } = appWithCapturedScope();

    const res = await inject(app, { url: "/api/idm-00/dashboard/summary?warehouseId=9", headers: OPERATOR });

    expect(res.status).toBe(403);
    expect(captured.warehouseIds).toBeUndefined();
  });
});
