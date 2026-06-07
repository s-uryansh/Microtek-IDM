import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasWarehouseScope(request, warehouseId) {
  if (request.auth.role === "admin") {
    return true;
  }

  if (warehouseId === undefined || warehouseId === null) {
    return false;
  }

  return request.auth.warehouseIds.includes(warehouseId);
}

export function createExceptionCorrectionRoutes({ exceptionCorrectionService }) {
  const router = Router();

  router.get(
    "/",
    requireAuthContext,
    requirePermission("exception:read"),
    async (request, response, next) => {
      try {
        const status = request.query.status || null;
        const contextType = request.query.contextType || null;
        const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1);
        const pageSize = Math.min(Math.max(1, Number.parseInt(request.query.pageSize, 10) || 50), 200);

        const warehouseIds = request.auth.role === "admin" ? null : request.auth.warehouseIds;

        const result = await exceptionCorrectionService.listExceptions({
          status,
          contextType,
          warehouseIds,
          page,
          pageSize
        });

        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/:exceptionId",
    requireAuthContext,
    requirePermission("exception:read"),
    async (request, response, next) => {
      try {
        const exceptionId = parseId(request.params.exceptionId);

        if (!exceptionId) {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Exception not found" } });
          return;
        }

        const result = await exceptionCorrectionService.getException({ exceptionId });

        if (!result) {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Exception not found" } });
          return;
        }

        if (!hasWarehouseScope(request, result.warehouseId)) {
          response.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
          return;
        }

        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/:exceptionId/correct",
    requireAuthContext,
    requirePermission("exception:correct"),
    async (request, response, next) => {
      try {
        const exceptionId = parseId(request.params.exceptionId);

        if (!exceptionId) {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Exception not found" } });
          return;
        }

        const correctionReason = request.body.correctionReason;

        if (!correctionReason || correctionReason.trim().length === 0) {
          response.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: "Correction reason is required"
            }
          });
          return;
        }

        const exception = await exceptionCorrectionService.getException({ exceptionId });

        if (!exception) {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Exception not found" } });
          return;
        }

        if (!hasWarehouseScope(request, exception.warehouseId)) {
          response.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
          return;
        }

        const result = await exceptionCorrectionService.correctException({
          exceptionId,
          correctionReason,
          userId: request.auth.userId
        });

        response.status(200).json(result);
      } catch (error) {
        if (error.message === "Exception not found") {
          response.status(404).json({ error: { code: "NOT_FOUND", message: "Exception not found" } });
          return;
        }

        if (
          error.message === "Exception is already resolved" ||
          error.message === "Exception was already corrected by another user"
        ) {
          response.status(409).json({ error: { code: "CONFLICT", message: error.message } });
          return;
        }

        next(error);
      }
    }
  );

  return router;
}
