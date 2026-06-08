import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createReconciliationRoutes({ reconciliationService }) {
  const router = Router();

  router.get(
    "/opening-stock/variance",
    requireAuthContext,
    requirePermission("reconciliation:read", { warehouseIdFromQuery: true }),
    async (request, response, next) => {
      try {
        const warehouseId = parsePositiveInt(request.query.warehouseId);
        const productId = request.query.productId ? parsePositiveInt(request.query.productId) : undefined;

        if (!warehouseId || (request.query.productId && !productId)) {
          sendError(response, 400, "BAD_REQUEST", "Invalid reconciliation filter");
          return;
        }

        const result = await reconciliationService.getOpeningStockVariance({
          warehouseIds: [warehouseId],
          productId
        });

        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
