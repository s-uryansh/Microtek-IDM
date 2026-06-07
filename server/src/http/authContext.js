import cookie from "cookie";

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
    response.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required"
      }
    });
    return;
  }

  try {
    request.auth = await request.authService.authenticateToken(token);
    next();
  } catch {
    response.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required"
      }
    });
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
