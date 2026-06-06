import { describe, expect, test } from "vitest";

import { createRbacPolicy } from "../src/security/rbacPolicy.js";

describe("RBAC scaffold", () => {
  const policy = createRbacPolicy();

  test("denies access by default", () => {
    expect(
      policy.can({
        role: "unknown",
        permission: "serial:read",
        userWarehouseIds: [10],
        resourceWarehouseId: 10
      })
    ).toBe(false);
  });

  test("allows an admin role with an explicit permission", () => {
    expect(
      policy.can({
        role: "admin",
        permission: "foundation:read",
        userWarehouseIds: [],
        resourceWarehouseId: undefined
      })
    ).toBe(true);
  });

  test("requires warehouse scope when a resource warehouse is provided", () => {
    expect(
      policy.can({
        role: "warehouse_operator",
        permission: "foundation:read",
        userWarehouseIds: [1],
        resourceWarehouseId: 2
      })
    ).toBe(false);
  });
});
