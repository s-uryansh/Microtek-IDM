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

async function inject(app, { method, url, headers = {} }) {
  const request = createRequest({ method, url, headers });
  const response = createResponse();
  app.handle(request, response);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    status: response.statusCode,
    body: response._getData() ? response._getJSONData() : null
  };
}

describe("Sprint 3 API authorization", () => {
  test("denies ageing report requests without authentication", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing?warehouseId=5"
    });

    expect(response.status).toBe(401);
  });

  test("denies ageing report requests outside caller warehouse scope", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing?warehouseId=5",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "4"
      }
    });

    expect(response.status).toBe(403);
  });

  test("returns report through injected service for authorized warehouse", async () => {
    const app = createApp({
      config,
      services: {
        ageingReportService: {
          async getAgeingReport(filters) {
            return {
              filters,
              summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 2 }],
              dataQuality: { missingReceivedAtCount: 0 }
            };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing?warehouseId=5&productId=10",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      filters: { warehouseIds: [5], productId: 10 },
      summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 2 }],
      dataQuality: { missingReceivedAtCount: 0 }
    });
  });
});

describe("Sprint 3 ageing export/summary warehouse scope", () => {
  function recordingService() {
    const calls = { export: [], sap: [], summary: [] };
    return {
      calls,
      ageingReportService: {
        async getExportRows(args) {
          calls.export.push(args);
          return { rows: [], total: 0 };
        },
        async getCsvExport(args) {
          calls.export.push(args);
          return "header\n";
        },
        async getSapExportRows(args) {
          calls.sap.push(args);
          return { rows: [], total: 0 };
        },
        async getSummary(args) {
          calls.summary.push(args);
          return { warehouses: [], asOf: "2026-01-01T00:00:00.000Z" };
        }
      }
    };
  }

  const supervisor = (warehouseIds) => ({
    "x-user-id": "supervisor_1",
    "x-user-role": "supervisor",
    "x-warehouse-ids": warehouseIds
  });
  const admin = (warehouseIds = "") => ({
    "x-user-id": "admin_1",
    "x-user-role": "admin",
    "x-warehouse-ids": warehouseIds
  });

  test("denies unauthenticated export", async () => {
    const app = createApp({ config });
    const response = await inject(app, { method: "GET", url: "/api/idm-08/ageing/export" });
    expect(response.status).toBe(401);
  });

  test("rejects export for a warehouse outside the caller's scope", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/export?warehouseId=5",
      headers: supervisor("4")
    });

    expect(response.status).toBe(403);
    expect(calls.export).toHaveLength(0);
  });

  test("confines an unscoped non-admin export to their assigned warehouses", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/export",
      headers: supervisor("4,7")
    });

    expect(response.status).toBe(200);
    expect(calls.export).toEqual([{ warehouseIds: [4, 7], limit: 1000, offset: 0 }]);
  });

  test("rejects export for a non-admin with no assigned warehouses", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/export",
      headers: supervisor("")
    });

    expect(response.status).toBe(403);
    expect(calls.export).toHaveLength(0);
  });

  test("scopes a non-admin export to a requested in-scope warehouse", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/export?warehouseId=4",
      headers: supervisor("4,7")
    });

    expect(response.status).toBe(200);
    expect(calls.export).toEqual([{ warehouseIds: [4], limit: 1000, offset: 0 }]);
  });

  test("lets an admin export all warehouses when unscoped", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/export",
      headers: admin()
    });

    expect(response.status).toBe(200);
    expect(calls.export).toEqual([{ warehouseIds: [], limit: 1000, offset: 0 }]);
  });

  test("scopes the SAP export the same way", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const denied = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/export/sap?warehouseId=5",
      headers: supervisor("4")
    });
    expect(denied.status).toBe(403);
    expect(calls.sap).toHaveLength(0);

    const allowed = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/export/sap?warehouseId=4",
      headers: supervisor("4")
    });
    expect(allowed.status).toBe(200);
    expect(calls.sap).toEqual([{ warehouseIds: [4], limit: 1000, offset: 0 }]);
  });

  test("scopes the summary to the caller's warehouses and gives admins all", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const sup = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/summary",
      headers: supervisor("4,7")
    });
    expect(sup.status).toBe(200);

    const adminResponse = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/summary",
      headers: admin()
    });
    expect(adminResponse.status).toBe(200);

    expect(calls.summary).toEqual([{ warehouseIds: [4, 7] }, { warehouseIds: [] }]);
  });

  test("rejects the summary for a non-admin with no assigned warehouses", async () => {
    const { ageingReportService, calls } = recordingService();
    const app = createApp({ config, services: { ageingReportService } });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing/summary",
      headers: supervisor("")
    });

    expect(response.status).toBe(403);
    expect(calls.summary).toHaveLength(0);
  });
});
