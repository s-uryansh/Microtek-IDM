function parseWarehouseIds(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter(Number.isInteger);
}

export function requireAuthContext(request, response, next) {
  const userId = request.get("x-user-id");
  const role = request.get("x-user-role");

  if (!userId || !role) {
    response.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required"
      }
    });
    return;
  }

  request.auth = {
    userId,
    role,
    warehouseIds: parseWarehouseIds(request.get("x-warehouse-ids"))
  };
  next();
}

export function requirePermission(permission, { warehouseIdFromBody = false, warehouseIdFromQuery = false } = {}) {
  return (request, response, next) => {
    const resourceWarehouseId = warehouseIdFromBody
      ? request.body?.warehouseId
      : warehouseIdFromQuery
        ? Number.parseInt(request.query?.warehouseId, 10)
        : undefined;
    const allowed = request.rbacPolicy.can({
      role: request.auth.role,
      permission,
      userWarehouseIds: request.auth.warehouseIds,
      resourceWarehouseId
    });

    if (!allowed) {
      response.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "Insufficient permission"
        }
      });
      return;
    }

    next();
  };
}
