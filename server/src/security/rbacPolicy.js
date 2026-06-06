const foundationPermissionsByRole = new Map([
  [
      "admin",
    new Set([
      "foundation:read",
      "integration:import",
      "serial:validate",
      "dispatch:write",
      "grn:write",
      "srn:write",
      "fulfilment:read",
      "ageing:read",
      "reconciliation:read",
      "serial-history:read"
    ])
  ],
  [
    "supervisor",
    new Set([
      "foundation:read",
      "serial:validate",
      "dispatch:write",
      "grn:write",
      "srn:write",
      "fulfilment:read",
      "ageing:read",
      "reconciliation:read",
      "serial-history:read"
    ])
  ],
  [
    "warehouse_operator",
    new Set(["foundation:read", "serial:validate", "dispatch:write", "grn:write", "srn:write", "fulfilment:read"])
  ]
]);

function hasWarehouseScope({ userWarehouseIds, resourceWarehouseId }) {
  if (resourceWarehouseId === undefined || resourceWarehouseId === null) {
    return true;
  }

  return userWarehouseIds.includes(resourceWarehouseId);
}

export function createRbacPolicy(rolePermissions = foundationPermissionsByRole) {
  return {
    can({ role, permission, userWarehouseIds = [], resourceWarehouseId }) {
      const permissions = rolePermissions.get(role);

      if (!permissions?.has(permission)) {
        return false;
      }

      return hasWarehouseScope({ userWarehouseIds, resourceWarehouseId });
    }
  };
}
