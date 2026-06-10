import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";
import { scopedWarehouses } from "../lookups/lookupService.js";

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Resolve the warehouse scope for an ageing export/summary request.
//
// This mirrors how the lookup routes use scopedWarehouses(): admins keep full
// cross-warehouse access (an empty `warehouseIds` array means "all warehouses"),
// while non-admins are confined to their assigned warehouses. An unscoped or
// empty-scope request from a non-admin is rejected rather than being widened to
// every warehouse — the gap that let a warehouse-scoped supervisor export data
// for warehouses they are not assigned to.
//
// Note: unlike the GET "/" route we do NOT add requirePermission's
// warehouseIdFromQuery option here. That option runs hasWarehouseScope against
// the caller's assigned warehouses, which would (a) reject admins who are not
// explicitly assigned the requested warehouse and (b) reject every unscoped
// request (NaN warehouseId) including the admin "all warehouses" export. Doing
// the scope resolution in-handler via scopedWarehouses preserves admin full
// access while still closing the gap for non-admins.
function resolveScope(request) {
  const role = request.auth.role;
  const userWarehouseIds = request.auth.warehouseIds ?? [];
  const hasWarehouseParam = Boolean(request.query.warehouseId);
  const requestedWarehouseId = hasWarehouseParam ? parsePositiveInt(request.query.warehouseId) : null;

  if (hasWarehouseParam && !requestedWarehouseId) {
    return { error: { status: 400, code: "BAD_REQUEST", message: "Invalid warehouseId" } };
  }

  if (role === "admin") {
    // Empty array => all warehouses; a specific warehouse when requested.
    return { warehouseIds: requestedWarehouseId ? [requestedWarehouseId] : [] };
  }

  const scope = scopedWarehouses({ requestedWarehouseId, userWarehouseIds, role });

  if (!scope || scope.length === 0) {
    return { error: { status: 403, code: "FORBIDDEN", message: "Insufficient permission" } };
  }

  return { warehouseIds: scope };
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
    "/products",
    requireAuthContext,
    requirePermission("ageing:read"),
    async (request, response, next) => {
      try {
        const warehouseId = parsePositiveInt(request.query.warehouseId);
        const bucketCode = request.query.bucketCode;

        if (!warehouseId || !bucketCode) {
          sendError(response, 400, "BAD_REQUEST", "warehouseId and bucketCode are required");
          return;
        }

        const products = await ageingReportService.getProductsInBucket({ warehouseId, bucketCode });
        response.status(200).json({ items: products });
      } catch (error) {
        if (error.status === 400) {
          sendError(response, 400, "BAD_REQUEST", error.message);
          return;
        }
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
        const scope = resolveScope(request);
        if (scope.error) {
          sendError(response, scope.error.status, scope.error.code, scope.error.message);
          return;
        }

        const format = request.query.format || "json";
        const limitInput = request.query.limit ? parseNonNegativeInt(request.query.limit) : 1000;
        const offset = request.query.offset ? parseNonNegativeInt(request.query.offset) : 0;

        if (limitInput === null || offset === null) {
          sendError(response, 400, "BAD_REQUEST", "Invalid pagination parameters");
          return;
        }

        const limit = clampLimit(limitInput, 5000);

        if (format === "csv") {
          const csv = await ageingReportService.getCsvExport({ warehouseIds: scope.warehouseIds, limit, offset });
          response.setHeader("Content-Type", "text/csv; charset=utf-8");
          response.setHeader("Content-Disposition", `attachment; filename="ageing-export.csv"`);
          response.status(200).send(csv);
          return;
        }

        const result = await ageingReportService.getExportRows({ warehouseIds: scope.warehouseIds, limit, offset });
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
        const scope = resolveScope(request);
        if (scope.error) {
          sendError(response, scope.error.status, scope.error.code, scope.error.message);
          return;
        }

        const limitInput = request.query.limit ? parseNonNegativeInt(request.query.limit) : 1000;
        const offset = request.query.offset ? parseNonNegativeInt(request.query.offset) : 0;

        if (limitInput === null || offset === null) {
          sendError(response, 400, "BAD_REQUEST", "Invalid pagination parameters");
          return;
        }

        const limit = clampLimit(limitInput, 5000);
        const result = await ageingReportService.getSapExportRows({ warehouseIds: scope.warehouseIds, limit, offset });

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
        const scope = resolveScope(request);
        if (scope.error) {
          sendError(response, scope.error.status, scope.error.code, scope.error.message);
          return;
        }

        const result = await ageingReportService.getSummary({ warehouseIds: scope.warehouseIds });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
