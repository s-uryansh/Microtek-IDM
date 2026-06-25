import { Router } from "express";

import { requireAuthContext, requirePermission, requireAdminRole } from "../http/authContext.js";
import { sendError } from "../http/errorResponse.js";

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createAdminRoutes({ adminService }) {
  const router = Router();

  router.use(requireAuthContext);

  /* ─────────────────────────────────
     INVOICE LISTING / EXPORT
     ───────────────────────────────── */

  router.get("/invoices", requirePermission("invoice:read"), async (request, response, next) => {
    try {
      const invoices = await adminService.listAllInvoices({ query: request.query.query });
      response.status(200).json({ items: invoices });
    } catch (error) {
      next(error);
    }
  });

  router.get("/invoices/export", requirePermission("invoice:export"), async (_request, response, next) => {
    try {
      const csv = await adminService.exportInvoicesCsv();
      response.status(200).json({ csv });
    } catch (error) {
      next(error);
    }
  });

  /* Everything below is sensitive master-data administration. */
  router.use(requirePermission("admin:access"));

  /* ─────────────────────────────────
     WAREHOUSE MANAGEMENT
     ───────────────────────────────── */

  router.get("/warehouses", async (_request, response, next) => {
    try {
      const warehouses = await adminService.listWarehouses();
      response.status(200).json({ items: warehouses });
    } catch (error) {
      next(error);
    }
  });

  /* ─────────────────────────────────
     ROLES & MEMBERS
     ───────────────────────────────── */

  router.get("/permissions", async (_request, response, next) => {
    try {
      const permissions = await adminService.listPermissionCodes();
      response.status(200).json({ items: permissions });
    } catch (error) {
      next(error);
    }
  });

  router.get("/roles", async (_request, response, next) => {
    try {
      const roles = await adminService.listRoles();
      response.status(200).json({ items: roles });
    } catch (error) {
      next(error);
    }
  });

  router.post("/roles", async (request, response, next) => {
    try {
      const result = await adminService.createRole({
        code: request.body.code,
        name: request.body.name,
        permissionCodes: request.body.permissionCodes,
        userId: request.auth.userId
      });
      response.status(201).json(result);
    } catch (error) {
      if (error.status) {
        sendError(response, error.status, "VALIDATION_ERROR", error.message);
        return;
      }
      next(error);
    }
  });

  router.patch("/roles/:roleId", async (request, response, next) => {
    try {
      const roleId = parseId(request.params.roleId);
      if (!roleId) {
        sendError(response, 404, "NOT_FOUND", "Role not found");
        return;
      }

      const result = await adminService.updateRole({
        roleId,
        name: request.body.name,
        isActive: request.body.isActive,
        permissionCodes: request.body.permissionCodes,
        userId: request.auth.userId
      });
      if (!result) {
        sendError(response, 404, "NOT_FOUND", "Role not found");
        return;
      }
      response.status(200).json(result);
    } catch (error) {
      if (error.status) {
        sendError(response, error.status, "VALIDATION_ERROR", error.message);
        return;
      }
      next(error);
    }
  });

  router.get("/members", async (request, response, next) => {
    try {
      const result = await adminService.listMembers({ query: request.query.query });
      response.status(200).json({ items: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/members/:userId", async (request, response, next) => {
    try {
      const userId = parseId(request.params.userId);
      if (!userId) {
        sendError(response, 404, "NOT_FOUND", "Member not found");
        return;
      }

      const result = await adminService.getMemberById(userId);
      if (!result) {
        sendError(response, 404, "NOT_FOUND", "Member not found");
        return;
      }
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/members", async (request, response, next) => {
    try {
      const result = await adminService.createMember({
        externalRef: request.body.externalRef,
        username: request.body.username,
        displayName: request.body.displayName,
        password: request.body.password,
        roleId: request.body.roleId,
        defaultWarehouseId: request.body.defaultWarehouseId,
        warehouseIds: request.body.warehouseIds,
        isActive: request.body.isActive ?? true,
        userId: request.auth.userId
      });
      response.status(201).json(result);
    } catch (error) {
      if (error.status) {
        sendError(response, error.status, "VALIDATION_ERROR", error.message);
        return;
      }
      next(error);
    }
  });

  router.patch("/members/:userId", async (request, response, next) => {
    try {
      const userId = parseId(request.params.userId);
      if (!userId) {
        sendError(response, 404, "NOT_FOUND", "Member not found");
        return;
      }

      const result = await adminService.updateMember({
        userId,
        externalRef: request.body.externalRef,
        username: request.body.username,
        displayName: request.body.displayName,
        password: request.body.password,
        roleId: request.body.roleId,
        defaultWarehouseId: request.body.defaultWarehouseId,
        warehouseIds: request.body.warehouseIds,
        isActive: request.body.isActive,
        updatedBy: request.auth.userId
      });
      if (!result) {
        sendError(response, 404, "NOT_FOUND", "Member not found");
        return;
      }
      response.status(200).json(result);
    } catch (error) {
      if (error.status) {
        sendError(response, error.status, "VALIDATION_ERROR", error.message);
        return;
      }
      next(error);
    }
  });

  // Soft delete: mark a member as no longer with the company (is_active = false).
  router.post("/members/:userId/deactivate", async (request, response, next) => {
    try {
      const userId = parseId(request.params.userId);
      if (!userId) {
        sendError(response, 404, "NOT_FOUND", "Member not found");
        return;
      }
      const result = await adminService.deactivateMember(userId, request.auth.userId);
      response.status(200).json(result);
    } catch (error) {
      if (error.status === 404) {
        sendError(response, 404, "NOT_FOUND", error.message);
        return;
      }
      next(error);
    }
  });

  router.post("/members/:userId/reactivate", async (request, response, next) => {
    try {
      const userId = parseId(request.params.userId);
      if (!userId) {
        sendError(response, 404, "NOT_FOUND", "Member not found");
        return;
      }
      const result = await adminService.reactivateMember(userId, request.auth.userId);
      response.status(200).json(result);
    } catch (error) {
      if (error.status === 404) {
        sendError(response, 404, "NOT_FOUND", error.message);
        return;
      }
      next(error);
    }
  });

  router.post("/warehouses", async (request, response, next) => {
    try {
      const { code, name, type } = request.body;
      const result = await adminService.createWarehouse({
        code,
        name,
        type,
        userId: request.auth.userId
      });
      response.status(201).json(result);
    } catch (error) {
      if (error.status) {
        sendError(response, error.status, "VALIDATION_ERROR", error.message);
        return;
      }
      next(error);
    }
  });

  router.post("/warehouses/:warehouseId/deactivate", async (request, response, next) => {
    try {
      const warehouseId = parseId(request.params.warehouseId);
      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "Warehouse not found");
        return;
      }
      const result = await adminService.deactivateWarehouse(warehouseId, request.auth.userId);
      if (!result) {
        sendError(response, 404, "NOT_FOUND", "Warehouse not found");
        return;
      }
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/warehouses/:warehouseId/reactivate", async (request, response, next) => {
    try {
      const warehouseId = parseId(request.params.warehouseId);
      if (!warehouseId) {
        sendError(response, 404, "NOT_FOUND", "Warehouse not found");
        return;
      }
      const result = await adminService.reactivateWarehouse(warehouseId, request.auth.userId);
      if (!result) {
        sendError(response, 404, "NOT_FOUND", "Warehouse not found");
        return;
      }
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  /* ─────────────────────────────────
     PRODUCT CSV IMPORT / EXPORT
     ───────────────────────────────── */

  router.get("/products/export", async (_request, response, next) => {
    try {
      const csv = await adminService.exportProductsCsv();
      response.status(200).json({ csv });
    } catch (error) {
      next(error);
    }
  });

  router.post("/products/import", async (request, response, next) => {
    try {
      const { csvContent } = request.body;
      if (!csvContent || typeof csvContent !== "string" || !csvContent.trim()) {
        sendError(response, 400, "VALIDATION_ERROR", "csvContent is required");
        return;
      }
      const result = await adminService.importProductsCsv({
        csvContent,
        userId: request.auth.userId
      });
      response.status(200).json(result);
    } catch (error) {
      if (error.status) {
        sendError(response, error.status, "VALIDATION_ERROR", error.message);
        return;
      }
      next(error);
    }
  });

  router.get("/products", async (_request, response, next) => {
    try {
      const products = await adminService.listProducts();
      response.status(200).json({ items: products });
    } catch (error) {
      next(error);
    }
  });

  /* ─────────────────────────────────
     INBOUND STOCK (SAP dispatch documents → warehouses)
     ───────────────────────────────── */

  router.get("/inbound-dispatches", async (_request, response, next) => {
    try {
      const items = await adminService.listInboundDispatches();
      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.get("/warehouse-stock", async (_request, response, next) => {
    try {
      const items = await adminService.listWarehouseStock();
      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  });

  /* ─────────────────────────────────
     INVOICE CSV IMPORT — admin role only
     ───────────────────────────────── */

  router.post("/invoices/import", requireAdminRole, async (request, response, next) => {
    try {
      const { csvContent } = request.body;
      if (!csvContent || typeof csvContent !== "string" || !csvContent.trim()) {
        sendError(response, 400, "VALIDATION_ERROR", "csvContent is required");
        return;
      }
      const result = await adminService.importInvoicesCsv({
        csvContent,
        userId: request.auth.userId
      });
      response.status(200).json(result);
    } catch (error) {
      if (error.status) {
        sendError(response, error.status, "VALIDATION_ERROR", error.message);
        return;
      }
      next(error);
    }
  });

  return router;
}
