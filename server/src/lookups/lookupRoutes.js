import { Router } from "express";

import { requireAuthContext, requirePermission } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanParam(value) {
  return value === "true" || value === "1";
}

function forbidden(response) {
  sendError(response, 403, "FORBIDDEN", "Insufficient permission");
}

function scopedWarehouseIds(lookupService, request) {
  const requestedWarehouseId = parsePositiveInt(request.query.warehouseId);
  return lookupService.scopedWarehouses({
    requestedWarehouseId,
    userWarehouseIds: request.auth.warehouseIds,
    role: request.auth.role
  });
}

export function createLookupRoutes({ lookupService }) {
  const router = Router();

  router.use(requireAuthContext, requirePermission("foundation:read"));

  router.get("/warehouses", async (request, response, next) => {
    try {
      const warehouseIds = scopedWarehouseIds(lookupService, request);
      if (!warehouseIds?.length) {
        forbidden(response);
        return;
      }

      const items = await lookupService.searchWarehouses({
        query: request.query.query,
        warehouseIds,
        limit: request.query.limit
      });
      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.get("/invoices", async (request, response, next) => {
    try {
      // Invoices are not warehouse-scoped — an operator looks one up by id or
      // SAP ref regardless of which warehouse they are assigned to.
      const items = await lookupService.searchInvoices({
        query: request.query.query,
        batteryOnly: booleanParam(request.query.batteryOnly),
        limit: request.query.limit
      });
      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.get("/dispatch-docs", async (request, response, next) => {
    try {
      const warehouseIds = scopedWarehouseIds(lookupService, request);
      if (!warehouseIds?.length) {
        forbidden(response);
        return;
      }

      const items = await lookupService.searchDispatchDocs({
        query: request.query.query,
        warehouseIds,
        limit: request.query.limit
      });
      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.get("/dispatches", async (request, response, next) => {
    try {
      const warehouseIds = scopedWarehouseIds(lookupService, request);
      if (!warehouseIds?.length) {
        forbidden(response);
        return;
      }

      const items = await lookupService.searchDispatches({
        query: request.query.query,
        warehouseIds,
        limit: request.query.limit
      });
      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
