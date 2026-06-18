import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";
import { createWebhookVerifier } from "../http/webhookVerifier.js";

export function createImportRoutes({ importService, importWebhookSecret }) {
  const router = Router();

  const webhookVerifier = createWebhookVerifier({ secret: importWebhookSecret });

  function verifyWebhookSignature(request, response, next) {
    const signatureHeader = request.get("X-IDM-Signature");
    const result = webhookVerifier.verify(request.rawBody, signatureHeader);

    if (!result.valid) {
      sendError(response, 401, "WEBHOOK_VERIFICATION_FAILED", result.reason);
      return;
    }

    next();
  }

  function hasWarehouseScope(request, warehouseId) {
    return request.auth.warehouseIds.some((authWarehouseId) => String(authWarehouseId) === String(warehouseId));
  }

  router.post(
    "/production",
    verifyWebhookSignature,
    requireAuthContext,
    requirePermission("integration:import"),
    async (request, response, next) => {
      try {
        const sourceLabel = request.get("X-Import-Source") || "unknown";
        const result = await importService.importProductionBatch({
          ...request.body,
          receivedBy: request.auth.userId,
          sourceLabel
        });
        response.status(result.status === "DUPLICATE_IGNORED" ? 200 : 202).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // Manual CSV import (dashboard upload). Same capability as the SAP webhook
  // above — gated by integration:import — but authenticated by the logged-in
  // user instead of an HMAC signature, since a human is uploading the file.
  router.post(
    "/production/csv",
    requireAuthContext,
    requirePermission("integration:import"),
    async (request, response, next) => {
      try {
        const result = await importService.importProductionBatchCsv({
          csvContent: request.body.csvContent,
          externalRef: request.body.externalRef,
          source: request.body.source,
          sourceLabel: request.body.sourceLabel || request.get("X-Import-Source") || "csv-upload",
          receivedBy: request.auth.userId
        });
        response.status(result.status === "DUPLICATE_IGNORED" ? 200 : 202).json(result);
      } catch (error) {
        if (error instanceof Error && /^(CSV |Invalid CSV|Invalid production)/.test(error.message)) {
          sendError(response, 400, "BAD_REQUEST", error.message);
          return;
        }
        next(error);
      }
    }
  );

  router.get(
    "/batches",
    requireAuthContext,
    requirePermission("integration:import"),
    async (request, response, next) => {
      try {
        const limit = Math.min(Number.parseInt(request.query.limit, 10) || 20, 100);
        const offset = Number.parseInt(request.query.offset, 10) || 0;
        const sourceLabel = request.query.sourceLabel || undefined;

        const result = await importService.listBatches({ limit, offset, sourceLabel });
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/batches/:batchId",
    requireAuthContext,
    requirePermission("integration:import"),
    async (request, response, next) => {
      try {
        const batchId = Number.parseInt(request.params.batchId, 10);

        if (!Number.isInteger(batchId) || batchId <= 0) {
          sendError(response, 400, "BAD_REQUEST", "Invalid batch ID");
          return;
        }

        const result = await importService.getBatch(batchId);

        if (!result) {
          sendError(response, 404, "NOT_FOUND", "Batch not found");
          return;
        }

        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/receipts/scans",
    requireAuthContext,
    requirePermission("grn:write"),
    async (request, response, next) => {
      try {
        const receivingWarehouseId = Number.parseInt(request.body.receivingWarehouseId, 10);

        if (!Number.isInteger(receivingWarehouseId) || receivingWarehouseId <= 0) {
          sendError(response, 400, "BAD_REQUEST", "Receiving warehouse ID is required");
          return;
        }

        if (!hasWarehouseScope(request, receivingWarehouseId)) {
          sendError(response, 403, "FORBIDDEN", "Insufficient permission");
          return;
        }

        const result = await importService.scanReceipt({
          serialNo: request.body.serialNo,
          receivingWarehouseId,
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
