import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createBatteryPreBillingRoutes({ batteryPreBillingService }) {
  const router = Router();

  router.post(
    "/battery/commit",
    requireAuthContext,
    requirePermission("battery:write"),
    async (request, response, next) => {
      try {
        const { invoiceId, serialNo } = request.body;

        if (!invoiceId || !serialNo) {
          sendError(response, 400, "BAD_REQUEST", "invoiceId and serialNo are required");
          return;
        }

        if (typeof invoiceId !== "number" || !Number.isInteger(invoiceId) || invoiceId < 1) {
          sendError(response, 400, "BAD_REQUEST", "invoiceId must be a positive integer");
          return;
        }

        if (typeof serialNo !== "string" || serialNo.trim().length === 0) {
          sendError(response, 400, "BAD_REQUEST", "serialNo must be a non-empty string");
          return;
        }

        // The operator enters the invoice and scans serials; the battery line is
        // resolved server-side from each serial's product. Warehouse scope is
        // enforced in the service against the operator's assigned warehouses.
        const result = await batteryPreBillingService.commitSerial({
          invoiceId,
          serialNo: serialNo.trim(),
          userId: request.auth.userId,
          userWarehouseIds: request.auth.warehouseIds
        });

        response.status(200).json(result);
      } catch (error) {
        if (error.status === 404) {
          sendError(response, 404, "NOT_FOUND", error.message);
          return;
        }

        next(error);
      }
    }
  );

  router.get(
    "/battery/invoices/:invoiceId/status",
    requireAuthContext,
    requirePermission("battery:read"),
    async (request, response, next) => {
      try {
        const invoiceId = parseId(request.params.invoiceId);

        if (!invoiceId) {
          sendError(response, 400, "BAD_REQUEST", "invoiceId must be a positive integer");
          return;
        }

        const result = await batteryPreBillingService.getCommitStatus({ invoiceId });

        response.status(200).json(result);
      } catch (error) {
        if (error.status === 404) {
          sendError(response, 404, "NOT_FOUND", error.message);
          return;
        }

        next(error);
      }
    }
  );

  return router;
}
