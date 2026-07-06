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
      listAllInvoices: vi.fn().mockResolvedValue([]),
      exportInvoicesCsv: vi.fn().mockResolvedValue("sap_invoice_ref\nINV-1")
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
      listAllInvoices: vi.fn().mockResolvedValue([]),
      exportInvoicesCsv: vi.fn().mockResolvedValue("sap_invoice_ref\nINV-1")
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

  test("invoice permissions allow a non-admin role to read and export invoices only", async () => {
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
      listAllInvoices: vi.fn().mockResolvedValue([{ invoiceId: 17, sapInvoiceRef: "INV-17" }]),
      exportInvoicesCsv: vi.fn().mockResolvedValue("sap_invoice_ref\nINV-17")
    };
    const rbacPolicy = {
      can: vi.fn(async ({ role, permission }) => {
        if (role === "admin") return true;
        return role === "supervisor" && ["invoice:read", "invoice:export"].includes(permission);
      })
    };

    const app = createApp({
      config,
      services: { adminService },
      rbacPolicy
    });

    const headers = {
      "x-user-id": "supervisor_1",
      "x-user-role": "supervisor",
      "x-warehouse-ids": "3"
    };
    const invoicesResponse = await inject(app, {
      method: "GET",
      url: "/api/admin/invoices",
      headers
    });
    const exportResponse = await inject(app, {
      method: "GET",
      url: "/api/admin/invoices/export",
      headers
    });
    const membersResponse = await inject(app, {
      method: "GET",
      url: "/api/admin/members",
      headers
    });

    expect(invoicesResponse.status).toBe(200);
    expect(invoicesResponse.body.items).toEqual([{ invoiceId: 17, sapInvoiceRef: "INV-17" }]);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.csv).toContain("INV-17");
    expect(membersResponse.status).toBe(403);
  });

  test("admin can soft delete (deactivate) and restore (reactivate) a member", async () => {
    const adminService = {
      deactivateMember: vi.fn().mockResolvedValue({ userId: 7, isActive: false }),
      reactivateMember: vi.fn().mockResolvedValue({ userId: 7, isActive: true })
    };
    const app = createApp({ config, services: { adminService } });
    const headers = { "x-user-id": "admin_1", "x-user-role": "admin" };

    const deactivate = await inject(app, { method: "POST", url: "/api/admin/members/7/deactivate", headers });
    const reactivate = await inject(app, { method: "POST", url: "/api/admin/members/7/reactivate", headers });

    expect(deactivate.status).toBe(200);
    expect(deactivate.body.isActive).toBe(false);
    expect(adminService.deactivateMember).toHaveBeenCalledWith(7, "admin_1");
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.isActive).toBe(true);
    expect(adminService.reactivateMember).toHaveBeenCalledWith(7, "admin_1");
  });

  test("deactivating a missing member returns 404", async () => {
    const adminService = {
      deactivateMember: vi.fn().mockRejectedValue(Object.assign(new Error("Member not found"), { status: 404 }))
    };
    const app = createApp({ config, services: { adminService } });

    const res = await inject(app, {
      method: "POST",
      url: "/api/admin/members/999/deactivate",
      headers: { "x-user-id": "admin_1", "x-user-role": "admin" }
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  test("a non-admin is denied member soft delete", async () => {
    const adminService = { deactivateMember: vi.fn() };
    const app = createApp({ config, services: { adminService } });

    const res = await inject(app, {
      method: "POST",
      url: "/api/admin/members/7/deactivate",
      headers: { "x-user-id": "supervisor_1", "x-user-role": "supervisor", "x-warehouse-ids": "3" }
    });

    expect(res.status).toBe(403);
    expect(adminService.deactivateMember).not.toHaveBeenCalled();
  });

  test("admin product list is served (regression: listProducts must exist)", async () => {
    const adminService = {
      listProducts: vi.fn().mockResolvedValue([{ productId: 1, productCode: "MTK-0001", name: "Demo" }])
    };
    const app = createApp({ config, services: { adminService } });

    const res = await inject(app, {
      method: "GET",
      url: "/api/admin/products",
      headers: { "x-user-id": "admin_1", "x-user-role": "admin" }
    });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(adminService.listProducts).toHaveBeenCalled();
  });
});
