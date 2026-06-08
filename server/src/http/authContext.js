import cookie from "cookie";

import { sendError } from "./errorResponse.js";

const AUTH_COOKIE_NAME = "idm_auth";

function getToken(request) {
  const authorization = request.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  const cookies = cookie.parse(request.headers.cookie || "");
  return cookies[AUTH_COOKIE_NAME] || null;
}

export async function requireAuthContext(request, response, next) {
  const token = getToken(request);

  if (!token && request.authService?.authenticateHeaders) {
    const auth = await request.authService.authenticateHeaders(request);
    if (auth) {
      request.auth = auth;
      next();
      return;
    }
  }

  if (!token || !request.authService?.authenticateToken) {
    sendError(response, 401, "UNAUTHORIZED", "Authentication required");
    return;
  }

  try {
    // Security boundary: authenticateToken re-fetches the user and warehouse scope from DB.
    // JWT warehouse claims are not authoritative because assignments can change after token issue.
    request.auth = await request.authService.authenticateToken(token);
    next();
  } catch {
    sendError(response, 401, "UNAUTHORIZED", "Authentication required");
  }
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
      sendError(response, 403, "FORBIDDEN", "Insufficient permission");
      return;
    }

    next();
  };
}
