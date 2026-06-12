import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

export function createSerialHistoryRoutes({ serialHistoryService }) {
  const router = Router();

  router.get(
    "/serials/:serialNo/history",
    requireAuthContext,
    requirePermission("serial-history:read"),
    async (request, response, next) => {
      try {
        // Serial history is a global audit trail of a serial's lifecycle across
        // warehouses. It is gated by the serial-history:read permission (granted
        // to admin/supervisor), not by the caller's warehouse assignment.
        const result = await serialHistoryService.getSerialHistory({ serialNo: request.params.serialNo });

        if (!result.found) {
          sendError(response, 404, "NOT_FOUND", "Serial not found");
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
