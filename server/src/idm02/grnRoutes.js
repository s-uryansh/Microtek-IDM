import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasWarehouseScope(request, warehouseId) {
  return request.auth.warehouseIds.some((authWarehouseId) => String(authWarehouseId) === String(warehouseId));
}

export function createGrnRoutes({ grnService }) {
  const router = Router();

  async function requireGrnWarehouseScope(request, response, next) {
    try {
      const grnId = parseId(request.params.grnId);
      const warehouseId = grnId ? await grnService.getGrnWarehouseId(grnId) : null;

      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "GRN not found");
        return;
      }

      if (!hasWarehouseScope(request, warehouseId)) {
        sendError(response, 403, "FORBIDDEN", "Insufficient permission");
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  router.post(
    "/",
    requireAuthContext,
    requirePermission("grn:write", { warehouseIdFromBody: true }),
    async (request, response, next) => {
      try {
        const result = await grnService.startGrn({
          receivingWarehouseId: request.body.warehouseId,
          dispatchRef: request.body.dispatchRef,
          role: request.auth.role,
          userWarehouseIds: request.auth.warehouseIds,
          userId: request.auth.userId
        });
        response.status(201).json(result);
      } catch (error) {
        if (error.status === 404) {
          sendError(response, 404, "NOT_FOUND", error.message);
          return;
        }
        if (error.status === 409) {
          sendError(response, 409, error.code || "CONFLICT", error.message);
          return;
        }
        next(error);
      }
    }
  );

  router.get("/:grnId", requireAuthContext, requirePermission("grn:write"), requireGrnWarehouseScope, async (request, response, next) => {
    try {
      const result = await grnService.getGrn({ grnId: parseId(request.params.grnId) });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:grnId/scans",
    requireAuthContext,
    requirePermission("grn:write"),
    requireGrnWarehouseScope,
    async (request, response, next) => {
      try {
        const result = await grnService.scanSerial({
          grnId: parseId(request.params.grnId),
          serialNo: request.body.serialNo,
          productId: parseId(request.body.productId) ?? undefined,
          userId: request.auth.userId
        });
        response.status(result.valid ? 201 : 200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:grnId/complete",
    requireAuthContext,
    requirePermission("grn:write"),
    requireGrnWarehouseScope,
    async (request, response, next) => {
      try {
        const result = await grnService.completeGrn({
          grnId: parseId(request.params.grnId),
          userId: request.auth.userId
        });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
