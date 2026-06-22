import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";

export function createDashboardRoutes({ dashboardService }) {
  const router = Router();

  router.get(
    "/summary",
    requireAuthContext,
    requirePermission("foundation:read"),
    async (request, response, next) => {
      try {
        const warehouseIds =
          request.auth.role === "admin" ? [] : (request.auth.warehouseIds ?? []);
        const result = await dashboardService.getSummary({ warehouseIds });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
