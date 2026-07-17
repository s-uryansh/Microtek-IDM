import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasWarehouseScope(request, warehouseId) {
  return request.auth.warehouseIds.some((authWarehouseId) => String(authWarehouseId) === String(warehouseId));
}

export function createSrnRoutes({ srnService }) {
  const router = Router();

  async function requireSrnWarehouseScope(request, response, next) {
    try {
      const srnId = parseId(request.params.srnId);
      const warehouseId = srnId ? await srnService.getSrnWarehouseId(srnId) : null;

      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "SRN not found");
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
    requirePermission("srn:write", { warehouseIdFromBody: true }),
    async (request, response, next) => {
      try {
        const expectedQuantityRaw = request.body.expectedQuantity;
        const expectedQuantity =
          expectedQuantityRaw === undefined || expectedQuantityRaw === null || expectedQuantityRaw === ""
            ? null
            : Number.parseInt(expectedQuantityRaw, 10);
        const result = await srnService.createSrn({
          receivingWarehouseId: request.body.warehouseId,
          invoiceId: request.body.invoiceId ? Number.parseInt(request.body.invoiceId, 10) : null,
          returnProductIds: request.body.returnProductIds,
          expectedQuantity: Number.isInteger(expectedQuantity) && expectedQuantity > 0 ? expectedQuantity : null,
          // Operator's up-front answer to "does this return contain products that
          // were not on the original dispatch?" — admits foreign stock when true.
          allowsForeignStock: request.body.allowsForeignStock === true,
          userId: request.auth.userId
        });
        response.status(201).json(result);
      } catch (error) {
        if (error.status === 409) {
          sendError(response, 409, error.code || "CONFLICT", error.message);
          return;
        }
        next(error);
      }
    }
  );

  router.post(
    "/:srnId/scans",
    requireAuthContext,
    requirePermission("srn:write"),
    requireSrnWarehouseScope,
    async (request, response, next) => {
      try {
        const parsedProductId = Number.parseInt(request.body.productId, 10);
        const result = await srnService.scanReturn({
          srnId: parseId(request.params.srnId),
          serialNo: request.body.serialNo,
          conditionTag: request.body.conditionTag,
          // Optional product-first context (see GRN). Omitted keeps legacy behaviour.
          productId: Number.isInteger(parsedProductId) && parsedProductId > 0 ? parsedProductId : undefined,
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
