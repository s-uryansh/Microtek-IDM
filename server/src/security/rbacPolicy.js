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
      "serial-history:read",
      "exception:read",
      "exception:correct",
      "battery:write",
      "battery:read",
      "invoice:read",
      "invoice:export",
      "admin:access"
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
      "serial-history:read",
      "exception:read",
      "exception:correct",
      "battery:write",
      "battery:read"
    ])
  ],
    [
      "warehouse_operator",
      new Set([
        "foundation:read",
        "serial:validate",
        "dispatch:write",
        "grn:write",
        "srn:write",
        "fulfilment:read",
        "exception:read",
        "battery:write",
        "battery:read"
      ])
    ]
]);

export const availablePermissionCodes = Array.from(
  new Set(Array.from(foundationPermissionsByRole.values()).flatMap((permissions) => Array.from(permissions)))
).sort();

// Static fallback used when no database-backed permission resolver is available
// (e.g. tests, or roles not yet seeded). Returns the permission codes granted to
// a role under the built-in foundation role map.
export function staticPermissionsForRole(role) {
  return Array.from(foundationPermissionsByRole.get(role) ?? []);
}

function hasWarehouseScope({ userWarehouseIds, resourceWarehouseId }) {
  if (resourceWarehouseId === undefined || resourceWarehouseId === null) {
    return true;
  }

  return userWarehouseIds.includes(resourceWarehouseId);
}

export function createRbacPolicy({
  rolePermissions = foundationPermissionsByRole,
  resolvePermissionsForRole = null
} = {}) {
  return {
    can({ role, permission, userWarehouseIds = [], resourceWarehouseId }) {
      if (role === "admin") {
        return true;
      }

      const resolvedPermissions = resolvePermissionsForRole
        ? resolvePermissionsForRole(role)
        : null;

      if (resolvedPermissions && typeof resolvedPermissions.then === "function") {
        return resolvedPermissions.then((permissions) => (
          permissions?.has(permission) && hasWarehouseScope({ userWarehouseIds, resourceWarehouseId })
        ));
      }

      const permissions = resolvedPermissions ?? rolePermissions.get(role);

      if (!permissions?.has(permission)) {
        return false;
      }

      return hasWarehouseScope({ userWarehouseIds, resourceWarehouseId });
    }
  };
}
