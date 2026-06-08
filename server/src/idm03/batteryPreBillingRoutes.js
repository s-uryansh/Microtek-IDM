import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasWarehouseScope(request, warehouseId) {
  return request.auth.warehouseIds.includes(warehouseId);
}

export function createBatteryPreBillingRoutes({ batteryPreBillingService }) {
  const router = Router();

  async function requireBatteryWarehouseScope(request, response, next) {
    try {
      const invoiceLineId = request.body?.invoiceLineId;

      if (!invoiceLineId || typeof invoiceLineId !== "number" || !Number.isInteger(invoiceLineId)) {
        next();
        return;
      }

      const warehouseId = await batteryPreBillingService.getInvoiceWarehouseByLineId(invoiceLineId);

      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "Invoice line not found");
        return;
      }

      if (!hasWarehouseScope(request, warehouseId)) {
        sendError(response, 403, "FORBIDDEN", "Insufficient permission");
        return;
      }

      next();
    } catch (error) {
      if (error.status === 404) {
        sendError(response, 404, "NOT_FOUND", "Invoice line not found");
        return;
      }

      next(error);
    }
  }

  async function requireBatteryInvoiceWarehouseScope(request, response, next) {
    try {
      const invoiceId = parseId(request.params.invoiceId);

      if (!invoiceId) {
        sendError(response, 400, "BAD_REQUEST", "invoiceId must be a positive integer");
        return;
      }

      const status = await batteryPreBillingService.getCommitStatus({ invoiceId });

      if (!status?.warehouseId) {
        sendError(response, 404, "NOT_FOUND", "Invoice not found");
        return;
      }

      if (!hasWarehouseScope(request, status.warehouseId)) {
        sendError(response, 403, "FORBIDDEN", "Insufficient permission");
        return;
      }

      response.locals.batteryCommitStatus = status;
      next();
    } catch (error) {
      if (error.status === 404) {
        sendError(response, 404, "NOT_FOUND", error.message);
        return;
      }

      next(error);
    }
  }

  router.post(
    "/battery/commit",
    requireAuthContext,
    requirePermission("battery:write"),
    requireBatteryWarehouseScope,
    async (request, response, next) => {
      try {
        const { invoiceLineId, serialNo } = request.body;

        if (!invoiceLineId || !serialNo) {
          sendError(response, 400, "BAD_REQUEST", "invoiceLineId and serialNo are required");
          return;
        }

        if (typeof invoiceLineId !== "number" || !Number.isInteger(invoiceLineId) || invoiceLineId < 1) {
          sendError(response, 400, "BAD_REQUEST", "invoiceLineId must be a positive integer");
          return;
        }

        if (typeof serialNo !== "string" || serialNo.trim().length === 0) {
          sendError(response, 400, "BAD_REQUEST", "serialNo must be a non-empty string");
          return;
        }

        const result = await batteryPreBillingService.commitSerial({
          invoiceLineId,
          serialNo: serialNo.trim(),
          userId: request.auth.userId
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
    requireBatteryInvoiceWarehouseScope,
    async (request, response, next) => {
      try {
        const result = response.locals.batteryCommitStatus;

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
