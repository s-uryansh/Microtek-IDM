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

export function createSrnRoutes({ srnService }) {
  const router = Router();

  async function requireSrnWarehouseScope(request, response, next) {
    try {
      const srnId = parseId(request.params.srnId);
      const warehouseId = srnId ? await srnService.getSrnWarehouseId(srnId) : null;

      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "SRN not found");
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
    requirePermission("srn:write", { warehouseIdFromBody: true }),
    async (request, response, next) => {
      try {
        const result = await srnService.createSrn({
          receivingWarehouseId: request.body.warehouseId,
          userId: request.auth.userId
        });
        response.status(201).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:srnId/scans",
    requireAuthContext,
    requirePermission("srn:write"),
    requireSrnWarehouseScope,
    async (request, response, next) => {
      try {
        const result = await srnService.scanReturn({
          srnId: parseId(request.params.srnId),
          serialNo: request.body.serialNo,
          conditionTag: request.body.conditionTag,
          userId: request.auth.userId
        });
        response.status(result.valid ? 201 : 200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
