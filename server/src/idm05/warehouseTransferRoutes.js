import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parseTransferId(request) {
  return Number.parseInt(request.params.transferId, 10);
}

function hasWarehouseScope(request, warehouseId) {
  return request.auth.warehouseIds.some((authWarehouseId) => String(authWarehouseId) === String(warehouseId));
}

export function createWarehouseTransferRoutes({ warehouseTransferService }) {
  const router = Router();

  async function requireTransferWarehouseScope(request, response, next) {
    try {
      const transferId = parseTransferId(request);
      const warehouseId = await warehouseTransferService.getTransferWarehouseId(transferId);
      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "Transfer not found");
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
        const result = await warehouseTransferService.startTransfer({
          sourceWarehouseId: request.body.warehouseId,
          destinationWarehouseId: request.body.destinationWarehouseId,
          reference: request.body.reference,
          userId: request.auth.userId
        });
        response.status(201).json(result);
      } catch (error) {
        if (error.status) {
          sendError(response, error.status, error.code || "VALIDATION_ERROR", error.message);
          return;
        }
        next(error);
      }
    }
  );

  router.post(
    "/:transferId/scans",
    requireAuthContext,
    requirePermission("dispatch:write"),
    requireTransferWarehouseScope,
    async (request, response, next) => {
      try {
        const sapDispatchDocId = parseTransferId(request);
        const sourceWarehouseId = await warehouseTransferService.getTransferWarehouseId(sapDispatchDocId);
        const result = await warehouseTransferService.scanSerial({
          sapDispatchDocId,
          sourceWarehouseId,
          serialNo: request.body.serialNo,
          userId: request.auth.userId
        });
        response.status(result.valid ? 201 : 200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
