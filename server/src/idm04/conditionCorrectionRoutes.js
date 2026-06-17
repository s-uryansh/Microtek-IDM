import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function hasWarehouseScope(request, warehouseId) {
  if (request.auth.role === "admin") {
    return true;
  }
  return request.auth.warehouseIds.some((authWarehouseId) => String(authWarehouseId) === String(warehouseId));
}

export function createConditionCorrectionRoutes({ conditionCorrectionService }) {
  const router = Router();

  // List serials on condition hold (DEFECTIVE/REPAIR), scoped to the caller's
  // warehouses unless they are an admin.
  router.get("/held", requireAuthContext, requirePermission("condition:correct"), async (request, response, next) => {
    try {
      const warehouseIds = request.auth.role === "admin" ? undefined : request.auth.warehouseIds;
      const items = await conditionCorrectionService.listHeldStock({ warehouseIds });
      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.post("/correct", requireAuthContext, requirePermission("condition:correct"), async (request, response, next) => {
    try {
      const serialNo = request.body.serialNo;
      const conditionTag = request.body.conditionTag;

      if (!serialNo || !conditionTag) {
        sendError(response, 400, "VALIDATION_ERROR", "serialNo and conditionTag are required.");
        return;
      }

      const warehouseId = await conditionCorrectionService.getSerialWarehouseId(serialNo);
      if (warehouseId === null || warehouseId === undefined) {
        sendError(response, 404, "NOT_FOUND", "Serial not found.");
        return;
      }

      if (!hasWarehouseScope(request, warehouseId)) {
        sendError(response, 403, "FORBIDDEN", "Insufficient permission");
        return;
      }

      const result = await conditionCorrectionService.correctConditionTag({
        serialNo,
        conditionTag,
        userId: request.auth.userId
      });

      if (!result.ok) {
        const status = result.code === "NOT_FOUND" ? 404 : 400;
        sendError(response, status, result.code, result.message);
        return;
      }

      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
