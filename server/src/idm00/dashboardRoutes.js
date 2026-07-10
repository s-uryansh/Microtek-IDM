import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

export function createDashboardRoutes({ dashboardService }) {
  const router = Router();

  router.get(
    "/summary",
    requireAuthContext,
    requirePermission("foundation:read"),
    async (request, response, next) => {
      try {
        const role = request.auth.role;
        const assigned = request.auth.warehouseIds ?? [];

        // Optional ?warehouseId filter lets an admin narrow the dashboard to a
        // single warehouse. A non-admin may only narrow to a warehouse they are
        // already assigned to — they can never widen their scope this way.
        const hasWarehouseParam = request.query.warehouseId !== undefined && request.query.warehouseId !== "";
        const requestedWarehouseId = Number.parseInt(request.query.warehouseId, 10);

        if (hasWarehouseParam && (!Number.isInteger(requestedWarehouseId) || requestedWarehouseId <= 0)) {
          sendError(response, 400, "BAD_REQUEST", "Invalid warehouseId");
          return;
        }

        let warehouseIds;
        if (role === "admin") {
          // No selection => empty array => all warehouses (service treats [] as null).
          warehouseIds = hasWarehouseParam ? [requestedWarehouseId] : [];
        } else if (hasWarehouseParam) {
          if (!assigned.some((id) => String(id) === String(requestedWarehouseId))) {
            sendError(response, 403, "FORBIDDEN", "Insufficient permission");
            return;
          }
          warehouseIds = [requestedWarehouseId];
        } else {
          warehouseIds = assigned;
        }

        const normalize = (value) => {
          const raw = typeof value === "string" ? value.trim() : "";
          return raw ? raw.toUpperCase() : null;
        };
        const category = normalize(request.query.category);
        const subCategory = normalize(request.query.subCategory);
        const productCategory = normalize(request.query.productCategory);

        const result = await dashboardService.getSummary({ warehouseIds, category, subCategory, productCategory });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/categories",
    requireAuthContext,
    requirePermission("foundation:read"),
    async (_request, response, next) => {
      try {
        const items = await dashboardService.listCategories();
        response.status(200).json({ items });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
