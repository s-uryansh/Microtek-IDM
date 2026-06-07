import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";

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
        response.status(404).json({ error: { code: "NOT_FOUND", message: "Invoice line not found" } });
        return;
      }

      if (!hasWarehouseScope(request, warehouseId)) {
        response.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
        return;
      }

      next();
    } catch (error) {
      if (error.status === 404) {
        response.status(404).json({ error: { code: "NOT_FOUND", message: "Invoice line not found" } });
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
          response.status(400).json({ error: "invoiceLineId and serialNo are required" });
          return;
        }

        if (typeof invoiceLineId !== "number" || !Number.isInteger(invoiceLineId) || invoiceLineId < 1) {
          response.status(400).json({ error: "invoiceLineId must be a positive integer" });
          return;
        }

        if (typeof serialNo !== "string" || serialNo.trim().length === 0) {
          response.status(400).json({ error: "serialNo must be a non-empty string" });
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
          response.status(404).json({ error: error.message });
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
          response.status(400).json({ error: "invoiceId must be a positive integer" });
          return;
        }

        const result = await batteryPreBillingService.getCommitStatus({ invoiceId });

        response.status(200).json(result);
      } catch (error) {
        if (error.status === 404) {
          response.status(404).json({ error: error.message });
          return;
        }

        next(error);
      }
    }
  );

  return router;
}
