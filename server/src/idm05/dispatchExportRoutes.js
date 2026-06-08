import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

export function createDispatchExportRoutes({ dispatchService }) {
  const router = Router();

  router.get(
    "/:dispatchId/confirmed-serials",
    requireAuthContext,
    requirePermission("dispatch:write"),
    async (request, response, next) => {
      try {
        const dispatchId = Number.parseInt(request.params.dispatchId, 10);

        if (!Number.isInteger(dispatchId) || dispatchId <= 0) {
          sendError(response, 400, "BAD_REQUEST", "Invalid dispatch ID");
          return;
        }

        const result = await dispatchService.getConfirmedSerials(dispatchId);
        response.status(200).json(result);
      } catch (error) {
        if (error.status === 404) {
          sendError(response, 404, "NOT_FOUND", "Dispatch not found");
          return;
        }
        if (error.status === 409) {
          sendError(response, 409, "NOT_COMPLETED", "Dispatch not yet completed");
          return;
        }
        next(error);
      }
    }
  );

  router.get(
    "/export/pending-sap-sync",
    requireAuthContext,
    requirePermission("admin:access"),
    async (request, response, next) => {
      try {
        // SAP outbound adapter will call this, POST confirmed serials
        // to SAP, then PATCH /api/idm-05/dispatches/:id/sap-synced to mark complete
        const result = await dispatchService.getPendingSapSyncDispatches();
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/:dispatchId/sap-synced",
    requireAuthContext,
    requirePermission("admin:access"),
    async (request, response, next) => {
      try {
        const dispatchId = Number.parseInt(request.params.dispatchId, 10);

        if (!Number.isInteger(dispatchId) || dispatchId <= 0) {
          sendError(response, 400, "BAD_REQUEST", "Invalid dispatch ID");
          return;
        }

        const { sapBatchId } = request.body;

        if (!sapBatchId || typeof sapBatchId !== "string" || sapBatchId.trim().length === 0) {
          sendError(response, 400, "BAD_REQUEST", "sapBatchId is required");
          return;
        }

        // Called by SAP outbound adapter after successful SAP posting
        const result = await dispatchService.markSapSynced(dispatchId, sapBatchId.trim());

        if (!result) {
          sendError(response, 404, "NOT_FOUND", "Dispatch not found");
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
