import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function canReadHistory(request, warehouseIds = []) {
  if (request.auth.role === "admin") return true;
  if (!warehouseIds.length) return false;
  return warehouseIds.some((warehouseId) => request.auth.warehouseIds.includes(warehouseId));
}

export function createSerialHistoryRoutes({ serialHistoryService }) {
  const router = Router();

  router.get(
    "/serials/:serialNo/history",
    requireAuthContext,
    requirePermission("serial-history:read"),
    async (request, response, next) => {
      try {
        const result = await serialHistoryService.getSerialHistory({ serialNo: request.params.serialNo });

        if (!result.found) {
          sendError(response, 404, "NOT_FOUND", "Serial not found");
          return;
        }

        if (!canReadHistory(request, result.warehouseIds)) {
          sendError(response, 403, "FORBIDDEN", "Insufficient permission");
          return;
        }

        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
