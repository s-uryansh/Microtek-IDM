import { describe, expect, test, vi } from "vitest";

import { createAdminService } from "../src/admin/adminService.js";

function createRepositories() {
  const calls = {
    createRole: [],
    updateRole: [],
    createMember: [],
    updateMember: [],
    replaceRolePermissions: [],
    replaceMemberWarehouses: []
  };

  const adminRepo = {
    async createRole(params) {
      calls.createRole.push(params);
      return { roleId: 12, code: params.code, name: params.name, isActive: params.isActive };
    },
    async updateRole(params) {
      calls.updateRole.push(params);
      return { roleId: params.roleId, code: "operator", name: params.name, isActive: params.isActive };
    },
    async getRoleById(roleId) {
      return roleId === 12 || roleId === 3 ? { roleId, code: "operator", name: "Operator", isActive: true } : null;
    },
    async listRoles() {
      return [{ roleId: 1, code: "admin", name: "Administrator", permissions: ["admin:access"] }];
    },
    async getPermissionsForRoleCode() {
      return new Set(["admin:access"]);
    },
    async createMember(params) {
      calls.createMember.push(params);
      return { userId: 7, username: params.username, displayName: params.displayName, defaultWarehouseId: params.defaultWarehouseId };
    },
    async updateMember(params) {
      calls.updateMember.push(params);
      return { userId: params.userId, username: params.username, displayName: params.displayName, defaultWarehouseId: params.defaultWarehouseId, isActive: params.isActive };
    },
    async getMemberById(userId) {
      return userId === 7 ? { userId: 7, username: "operator_1" } : null;
    },
    async listMembers() {
      return [{ userId: 7, username: "operator_1" }];
    },
    async listWarehouses() {
      return [{ warehouseId: 3, code: "RW-01", name: "Regional Warehouse 01" }];
    },
    async listProducts() {
      return [];
    },
    async upsertProduct() {
      return {};
    },
    async listAllInvoices() {
      return [];
    },
    async invoiceLines() {
      return [];
    }
  };

  const repositories = {
    withTransaction: vi.fn(async (work) => work({ admin: adminRepo })),
    admin: adminRepo
  };

  return { repositories, calls };
}

describe("admin service", () => {
  test("creates a role with validated permissions", async () => {
    const { repositories, calls } = createRepositories();
    const service = createAdminService({ repositories, adminRepo: repositories.admin });

    const result = await service.createRole({
      code: "qa_lead",
      name: "QA Lead",
      permissionCodes: ["admin:access"],
      userId: "admin_1"
    });

    expect(result.code).toBe("qa_lead");
    expect(calls.createRole[0]).toMatchObject({
      code: "qa_lead",
      name: "QA Lead",
      createdBy: "admin_1"
    });
  });

  test("creates a member with a default warehouse assignment", async () => {
    const { repositories, calls } = createRepositories();
    const service = createAdminService({ repositories, adminRepo: repositories.admin });

    const result = await service.createMember({
      username: "operator_1",
      displayName: "Development Operator",
      password: "admin123",
      roleId: 3,
      defaultWarehouseId: 3,
      warehouseIds: [3],
      userId: "admin_1"
    });

    expect(result.username).toBe("operator_1");
    expect(calls.createMember[0]).toMatchObject({
      username: "operator_1",
      displayName: "Development Operator",
      roleId: 3,
      defaultWarehouseId: 3,
      createdBy: "admin_1"
    });
  });

  test("updates member active state and warehouse assignment", async () => {
    const { repositories, calls } = createRepositories();
    const service = createAdminService({ repositories, adminRepo: repositories.admin });

    const result = await service.updateMember({
      userId: 7,
      displayName: "Development Operator Updated",
      isActive: false,
      defaultWarehouseId: 3,
      warehouseIds: [3],
      updatedBy: "admin_1"
    });

    expect(result.isActive).toBe(false);
    expect(calls.updateMember[0]).toMatchObject({
      userId: 7,
      displayName: "Development Operator Updated",
      defaultWarehouseId: 3,
      isActive: false,
      updatedBy: "admin_1"
    });
  });
});
