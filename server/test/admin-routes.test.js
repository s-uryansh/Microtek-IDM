import { createRequest, createResponse } from "node-mocks-http";
import { describe, expect, test, vi } from "vitest";

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

describe("admin routes", () => {
  test("admin can read members and permissions", async () => {
    const adminService = {
      listWarehouses: vi.fn().mockResolvedValue([]),
      listPermissionCodes: vi.fn().mockResolvedValue(["admin:access"]),
      listRoles: vi.fn().mockResolvedValue([]),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      listMembers: vi.fn().mockResolvedValue([{ userId: 7, username: "operator_1" }]),
      getMemberById: vi.fn(),
      createMember: vi.fn(),
      updateMember: vi.fn(),
      listProducts: vi.fn().mockResolvedValue([]),
      exportProductsCsv: vi.fn().mockResolvedValue({ csv: "" }),
      importProductsCsv: vi.fn(),
      listAllInvoices: vi.fn().mockResolvedValue([])
    };

    const app = createApp({
      config,
      services: {
        adminService
      }
    });

    const membersResponse = await inject(app, {
      method: "GET",
      url: "/api/admin/members",
      headers: {
        "x-user-id": "admin_1",
        "x-user-role": "admin"
      }
    });

    const permissionsResponse = await inject(app, {
      method: "GET",
      url: "/api/admin/permissions",
      headers: {
        "x-user-id": "admin_1",
        "x-user-role": "admin"
      }
    });

    expect(membersResponse.status).toBe(200);
    expect(membersResponse.body.items).toHaveLength(1);
    expect(permissionsResponse.status).toBe(200);
    expect(permissionsResponse.body.items).toContain("admin:access");
  });

  test("non-admin users are denied access", async () => {
    const adminService = {
      listWarehouses: vi.fn().mockResolvedValue([]),
      listPermissionCodes: vi.fn().mockResolvedValue([]),
      listRoles: vi.fn().mockResolvedValue([]),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      listMembers: vi.fn().mockResolvedValue([]),
      getMemberById: vi.fn(),
      createMember: vi.fn(),
      updateMember: vi.fn(),
      listProducts: vi.fn().mockResolvedValue([]),
      exportProductsCsv: vi.fn().mockResolvedValue({ csv: "" }),
      importProductsCsv: vi.fn(),
      listAllInvoices: vi.fn().mockResolvedValue([])
    };

    const app = createApp({
      config,
      services: {
        adminService
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/admin/members",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "3"
      }
    });

    expect(response.status).toBe(403);
  });
});
