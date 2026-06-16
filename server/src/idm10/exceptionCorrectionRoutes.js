import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

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

  return request.auth.warehouseIds.some((authWarehouseId) => String(authWarehouseId) === String(warehouseId));
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
        const limit = request.query.limit === undefined
          ? undefined
          : Math.min(Number.parseInt(request.query.limit, 10), 200);
        const offset = request.query.offset === undefined
          ? undefined
          : Number.parseInt(request.query.offset, 10);

        if (
          (request.query.limit !== undefined && (!Number.isInteger(limit) || limit < 0)) ||
          (request.query.offset !== undefined && (!Number.isInteger(offset) || offset < 0))
        ) {
          sendError(response, 400, "BAD_REQUEST", "Invalid pagination filter");
          return;
        }

        const warehouseIds = request.auth.role === "admin" ? null : request.auth.warehouseIds;

        const result = await exceptionCorrectionService.listExceptions({
          status,
          contextType,
          warehouseIds,
          page,
          pageSize,
          ...(limit !== undefined ? { limit } : {}),
          ...(offset !== undefined ? { offset } : {})
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
          sendError(response, 404, "NOT_FOUND", "Exception not found");
          return;
        }

        const result = await exceptionCorrectionService.getException({ exceptionId });

        if (!result) {
          sendError(response, 404, "NOT_FOUND", "Exception not found");
          return;
        }

        if (!hasWarehouseScope(request, result.warehouseId)) {
          sendError(response, 403, "FORBIDDEN", "Insufficient permission");
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
          sendError(response, 404, "NOT_FOUND", "Exception not found");
          return;
        }

        const correctionReason = request.body.correctionReason;

        if (!correctionReason || correctionReason.trim().length === 0) {
          sendError(response, 400, "VALIDATION_ERROR", "Correction reason is required");
          return;
        }

        const exception = await exceptionCorrectionService.getException({ exceptionId });

        if (!exception) {
          sendError(response, 404, "NOT_FOUND", "Exception not found");
          return;
        }

        if (!hasWarehouseScope(request, exception.warehouseId)) {
          sendError(response, 403, "FORBIDDEN", "Insufficient permission");
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
          sendError(response, 404, "NOT_FOUND", "Exception not found");
          return;
        }

        if (
          error.message === "Exception is already resolved" ||
          error.message === "Exception was already corrected by another user" ||
          error.message === "Dispatch exception can only be corrected after the invoice is dispatched"
        ) {
          sendError(response, 409, "CONFLICT", error.message);
          return;
        }

        next(error);
      }
    }
  );

  return router;
}
