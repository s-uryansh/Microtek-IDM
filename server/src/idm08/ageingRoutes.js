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

function clampLimit(value, max) {
  return Math.min(value, max);
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

  router.get(
    "/export",
    requireAuthContext,
    requirePermission("ageing:read"),
    async (request, response, next) => {
      try {
        const warehouseId = request.query.warehouseId ? parsePositiveInt(request.query.warehouseId) : undefined;
        const format = request.query.format || "json";
        const limitInput = request.query.limit ? parseNonNegativeInt(request.query.limit) : 1000;
        const offset = request.query.offset ? parseNonNegativeInt(request.query.offset) : 0;

        if (limitInput === null || offset === null) {
          sendError(response, 400, "BAD_REQUEST", "Invalid pagination parameters");
          return;
        }

        const limit = clampLimit(limitInput, 5000);

        if (format === "csv") {
          const csv = await ageingReportService.getCsvExport({ warehouseId, limit, offset });
          response.setHeader("Content-Type", "text/csv; charset=utf-8");
          response.setHeader("Content-Disposition", `attachment; filename="ageing-export.csv"`);
          response.status(200).send(csv);
          return;
        }

        const result = await ageingReportService.getExportRows({ warehouseId, limit, offset });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/export/sap",
    requireAuthContext,
    requirePermission("ageing:read"),
    async (request, response, next) => {
      try {
        // SAP field mapping is provisional — confirm MATNR/LGORT
        // field names with client SAP team when OI-7 closes
        const warehouseId = request.query.warehouseId ? parsePositiveInt(request.query.warehouseId) : undefined;
        const limitInput = request.query.limit ? parseNonNegativeInt(request.query.limit) : 1000;
        const offset = request.query.offset ? parseNonNegativeInt(request.query.offset) : 0;

        if (limitInput === null || offset === null) {
          sendError(response, 400, "BAD_REQUEST", "Invalid pagination parameters");
          return;
        }

        const limit = clampLimit(limitInput, 5000);
        const result = await ageingReportService.getSapExportRows({ warehouseId, limit, offset });

        response.setHeader("X-IDM-Export-Timestamp", new Date().toISOString());
        response.setHeader("X-IDM-Record-Count", String(result.total));
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/summary",
    requireAuthContext,
    requirePermission("ageing:read"),
    async (request, response, next) => {
      try {
        const result = await ageingReportService.getSummary();
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
