import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function createAgeingRoutes({ ageingReportService }) {
  const router = Router();

  router.get(
    "/",
    requireAuthContext,
    requirePermission("ageing:read", { warehouseIdFromQuery: true }),
    async (request, response, next) => {
      try {
        const warehouseId = parsePositiveInt(request.query.warehouseId);
        const productId = request.query.productId ? parsePositiveInt(request.query.productId) : undefined;
        const limit = request.query.limit ? parseNonNegativeInt(request.query.limit) : undefined;
        const offset = request.query.offset ? parseNonNegativeInt(request.query.offset) : undefined;

        if (
          !warehouseId ||
          (request.query.productId && !productId) ||
          (request.query.limit && limit === null) ||
          (request.query.offset && offset === null)
        ) {
          sendError(response, 400, "BAD_REQUEST", "Invalid report filter");
          return;
        }

        const result = await ageingReportService.getAgeingReport({
          warehouseIds: [warehouseId],
          productId,
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {})
        });

        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
