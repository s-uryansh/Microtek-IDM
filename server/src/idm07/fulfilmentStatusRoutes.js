import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function hasWarehouseScope(request, warehouseId) {
  return request.auth.role === "admin" || request.auth.warehouseIds.includes(warehouseId);
}

export function createFulfilmentStatusRoutes({ fulfilmentStatusService, repositories }) {
  const router = Router();

  router.get(
    "/orders/:invoiceId/status",
    requireAuthContext,
    requirePermission("fulfilment:read"),
    async (request, response, next) => {
      try {
        const result = await fulfilmentStatusService.getInvoiceStatus({
          invoiceId: Number.parseInt(request.params.invoiceId, 10),
          repositories
        });

        if (!result) {
          sendError(response, 404, "NOT_FOUND", "Resource not found");
          return;
        }

        if (!hasWarehouseScope(request, result.warehouseId)) {
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
