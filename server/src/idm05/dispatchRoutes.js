import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parseDispatchId(request) {
  return Number.parseInt(request.params.dispatchId, 10);
}

function hasWarehouseScope(request, warehouseId) {
  return request.auth.warehouseIds.some((authWarehouseId) => String(authWarehouseId) === String(warehouseId));
}

export function createDispatchRoutes({ dispatchService }) {
  const router = Router();

  async function requireDispatchWarehouseScope(request, response, next) {
    try {
      const dispatchId = parseDispatchId(request);
      const warehouseId = await dispatchService.getDispatchWarehouseId(dispatchId);

      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "Dispatch not found");
        return;
      }

      if (!hasWarehouseScope(request, warehouseId)) {
        sendError(response, 403, "FORBIDDEN", "Insufficient permission");
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  router.post(
    "/",
    requireAuthContext,
    requirePermission("dispatch:write", { warehouseIdFromBody: true }),
    async (request, response, next) => {
      try {
        const result = await dispatchService.startDispatch({
          invoiceId: request.body.invoiceId,
          warehouseId: request.body.warehouseId,
          userId: request.auth.userId
        });
        response.status(201).json(result);
      } catch (error) {
        if (error.status === 404) {
          sendError(response, 404, "NOT_FOUND", "Invoice not found");
          return;
        }
        if (error.status === 409) {
          sendError(response, 409, error.code || "CONFLICT", error.message);
          return;
        }
        next(error);
      }
    }
  );

  router.post(
    "/:dispatchId/scans",
    requireAuthContext,
    requirePermission("dispatch:write"),
    requireDispatchWarehouseScope,
    async (request, response, next) => {
      try {
        const result = await dispatchService.scanSerial({
          dispatchId: parseDispatchId(request),
          invoiceLineId: request.body.invoiceLineId,
          serialNo: request.body.serialNo,
          userId: request.auth.userId
        });
        response.status(result.valid ? 201 : 200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:dispatchId/complete",
    requireAuthContext,
    requirePermission("dispatch:write"),
    requireDispatchWarehouseScope,
    async (request, response, next) => {
      try {
        const result = await dispatchService.completeDispatch({
          dispatchId: parseDispatchId(request),
          userId: request.auth.userId
        });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
