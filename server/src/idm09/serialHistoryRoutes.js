import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";

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
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Serial not found" } });
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
