import { parse } from "csv-parse/sync";

import { hashPassword } from "../auth/password.js";
import { sanitizeCsvCell } from "../utils/sanitizeCsvCell.js";
import { availablePermissionCodes } from "../security/rbacPolicy.js";

const VALID_WAREHOUSE_TYPES = ["PLANT", "CENTRAL", "REGIONAL"];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
}

function normalizePermissionCodes(permissionCodes) {
  const codes = Array.isArray(permissionCodes) ? permissionCodes : [];
  return [...new Set(codes.map((code) => String(code).trim()).filter(Boolean))];
}

export function createAdminService({ repositories, adminRepo }) {
  return {
    /* ══════════════════════════════════════════
       WAREHOUSES
       ══════════════════════════════════════════ */

    async listWarehouses() {
      return adminRepo.listWarehouses();
    },

    async createWarehouse({ code, name, type, userId }) {
      if (!code || !code.trim()) {
        throw Object.assign(new Error("Warehouse code is required"), { status: 400 });
      }
      if (!name || !name.trim()) {
        throw Object.assign(new Error("Warehouse name is required"), { status: 400 });
      }
      if (!VALID_WAREHOUSE_TYPES.includes(type)) {
        throw Object.assign(
          new Error(`Warehouse type must be one of: ${VALID_WAREHOUSE_TYPES.join(", ")}`),
          { status: 400 }
        );
      }

      return adminRepo.createWarehouse({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        createdBy: userId
      });
    },

    async deactivateWarehouse(warehouseId, userId) {
      const wh = await adminRepo.getWarehouseById(warehouseId);
      if (!wh) {
        throw Object.assign(new Error("Warehouse not found"), { status: 404 });
      }
      return adminRepo.toggleWarehouseActive(warehouseId, false, userId);
    },

    async reactivateWarehouse(warehouseId, userId) {
      const wh = await adminRepo.getWarehouseById(warehouseId);
      if (!wh) {
        throw Object.assign(new Error("Warehouse not found"), { status: 404 });
      }
      return adminRepo.toggleWarehouseActive(warehouseId, true, userId);
    },

    /* ══════════════════════════════════════════
       ROLES
       ══════════════════════════════════════════ */

    async listRoles() {
      return adminRepo.listRoles();
    },

    async listPermissionCodes() {
      return availablePermissionCodes;
    },

    async createRole({ code, name, permissionCodes = [], userId }) {
      const normalizedCode = normalizeText(code).toLowerCase();
      const normalizedName = normalizeText(name);
      const permissions = normalizePermissionCodes(permissionCodes);

      if (!normalizedCode) {
        throw Object.assign(new Error("Role code is required"), { status: 400 });
      }
      if (!normalizedName) {
        throw Object.assign(new Error("Role name is required"), { status: 400 });
      }

      for (const permissionCode of permissions) {
        if (!availablePermissionCodes.includes(permissionCode)) {
          throw Object.assign(new Error(`Unknown permission: ${permissionCode}`), { status: 400 });
        }
      }

      return repositories.withTransaction(async (txRepositories) =>
        txRepositories.admin.createRole({
          code: normalizedCode,
          name: normalizedName,
          permissionCodes: permissions,
          createdBy: userId
        })
      );
    },

    async updateRole({ roleId, name, isActive, permissionCodes, userId }) {
      const normalizedName = name === undefined ? undefined : normalizeText(name);
      const permissions = permissionCodes === undefined ? undefined : normalizePermissionCodes(permissionCodes);

      if (normalizedName !== undefined && !normalizedName) {
        throw Object.assign(new Error("Role name is required"), { status: 400 });
      }

      if (Array.isArray(permissions)) {
        for (const permissionCode of permissions) {
          if (!availablePermissionCodes.includes(permissionCode)) {
            throw Object.assign(new Error(`Unknown permission: ${permissionCode}`), { status: 400 });
          }
        }
      }

      return repositories.withTransaction(async (txRepositories) => {
        const role = await txRepositories.admin.getRoleById(roleId);
        if (!role) {
          throw Object.assign(new Error("Role not found"), { status: 404 });
        }

        return txRepositories.admin.updateRole({
          roleId,
          name: normalizedName,
          isActive,
          permissionCodes: permissions,
          updatedBy: userId
        });
      });
    },

    /* ══════════════════════════════════════════
       MEMBERS
       ══════════════════════════════════════════ */

    async listMembers({ query } = {}) {
      return adminRepo.listMembers({ query });
    },

    async getMemberById(userId) {
      return adminRepo.getMemberById(userId);
    },

    async createMember({
      externalRef,
      username,
      displayName,
      password,
      roleId,
      defaultWarehouseId,
      warehouseIds,
      isActive = true,
      userId
    }) {
      const normalizedUsername = normalizeText(username);
      const normalizedDisplayName = normalizeText(displayName);
      const normalizedExternalRef = normalizeText(externalRef) || null;
      const normalizedWarehouses = normalizeIdList(warehouseIds);
      const normalizedDefaultWarehouseId = defaultWarehouseId ? Number(defaultWarehouseId) : null;

      if (!normalizedUsername) {
        throw Object.assign(new Error("Username is required"), { status: 400 });
      }
      if (!normalizedDisplayName) {
        throw Object.assign(new Error("Display name is required"), { status: 400 });
      }
      if (!roleId) {
        throw Object.assign(new Error("Role is required"), { status: 400 });
      }
      if (!normalizedDefaultWarehouseId) {
        throw Object.assign(new Error("Default warehouse is required"), { status: 400 });
      }
      if (!password || !String(password).trim()) {
        throw Object.assign(new Error("Password is required"), { status: 400 });
      }

      const resolvedWarehouseIds = normalizedWarehouses.length > 0
        ? normalizedWarehouses
        : normalizedDefaultWarehouseId
          ? [normalizedDefaultWarehouseId]
          : [];

      const passwordHash = await hashPassword(String(password));
      return repositories.withTransaction(async (txRepositories) =>
        txRepositories.admin.createMember({
          externalRef: normalizedExternalRef,
          username: normalizedUsername,
          displayName: normalizedDisplayName,
          passwordHash,
          roleId: Number(roleId),
          defaultWarehouseId: normalizedDefaultWarehouseId,
          warehouseIds: resolvedWarehouseIds,
          isActive,
          createdBy: userId
        })
      );
    },

    async updateMember({
      userId,
      externalRef,
      username,
      displayName,
      password,
      roleId,
      defaultWarehouseId,
      warehouseIds,
      isActive,
      updatedBy
    }) {
      const normalizedExternalRef = externalRef === undefined ? undefined : normalizeText(externalRef) || null;
      const normalizedUsername = username === undefined ? undefined : normalizeText(username);
      const normalizedDisplayName = displayName === undefined ? undefined : normalizeText(displayName);
      const normalizedWarehouses = warehouseIds === undefined ? undefined : normalizeIdList(warehouseIds);
      const normalizedDefaultWarehouseId = defaultWarehouseId === undefined ? undefined : (defaultWarehouseId ? Number(defaultWarehouseId) : null);

      if (normalizedUsername !== undefined && !normalizedUsername) {
        throw Object.assign(new Error("Username is required"), { status: 400 });
      }
      if (normalizedDisplayName !== undefined && !normalizedDisplayName) {
        throw Object.assign(new Error("Display name is required"), { status: 400 });
      }

      const passwordHash = password ? await hashPassword(String(password)) : undefined;

      if (normalizedDefaultWarehouseId === null && Array.isArray(normalizedWarehouses) && normalizedWarehouses.length === 0) {
        throw Object.assign(new Error("Default warehouse is required"), { status: 400 });
      }

      return repositories.withTransaction(async (txRepositories) => {
        const member = await txRepositories.admin.getMemberById(userId);
        if (!member) {
          throw Object.assign(new Error("Member not found"), { status: 404 });
        }

        const resolvedWarehouseIds = normalizedWarehouses === undefined
          ? undefined
          : normalizedWarehouses.length > 0
            ? normalizedWarehouses
            : normalizedDefaultWarehouseId
              ? [normalizedDefaultWarehouseId]
              : [];

        return txRepositories.admin.updateMember({
          userId,
          externalRef: normalizedExternalRef,
          username: normalizedUsername,
          displayName: normalizedDisplayName,
          passwordHash,
          roleId: roleId === undefined ? undefined : Number(roleId),
          defaultWarehouseId: normalizedDefaultWarehouseId,
          warehouseIds: resolvedWarehouseIds,
          isActive,
          updatedBy
        });
      });
    },

    /* ══════════════════════════════════════════
       PRODUCTS — CSV IMPORT / EXPORT
       ══════════════════════════════════════════ */

    VALID_PRODUCT_CATEGORIES: ["INVERTER", "BATTERY", "SOLAR", "ACCESSORY"],

    async exportProductsCsv() {
      const products = await adminRepo.listProducts();
      const headers = ["product_code", "name", "segment", "category", "is_battery", "is_active"];
      const headerLine = headers.map(sanitizeCsvCell).join(",");
      const bodyLines = products.map((p) =>
        headers
          .map((h) =>
            sanitizeCsvCell(
              String(
                p[
                  h === "product_code"
                    ? "productCode"
                    : h === "is_battery"
                      ? "isBattery"
                      : h === "is_active"
                        ? "isActive"
                        : h
                ] ?? ""
              )
            )
          )
          .join(",")
      );
      return [headerLine, ...bodyLines].join("\n");
    },

    async importProductsCsv({ csvContent, userId }) {
      let records;
      try {
        records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true
        });
      } catch {
        throw Object.assign(new Error("Invalid CSV format"), { status: 400 });
      }

      if (!records.length) {
        return { imported: 0, errors: [] };
      }

      const errors = [];
      const imported = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2;

        try {
          const productCode = String(row.product_code || row.productCode || "").trim().toUpperCase();
          if (!productCode) {
            errors.push({ row: rowNum, message: "product_code is required" });
            continue;
          }

          const name = String(row.name || "").trim();
          if (!name) {
            errors.push({ row: rowNum, message: "name is required" });
            continue;
          }

          const segment = String(row.segment || row.category || "GENERAL").trim().toUpperCase();
          const category = String(row.category || row.segment || segment).trim().toUpperCase();
          const validCategories = this.VALID_PRODUCT_CATEGORIES;

          const finalCategory = validCategories.includes(category) ? category : "ACCESSORY";
          const isBattery =
            String(row.is_battery || row.isBattery || "").toLowerCase() === "true" ||
            finalCategory === "BATTERY";

          const result = await adminRepo.upsertProduct({
            productCode,
            name,
            segment,
            category: finalCategory,
            isBattery,
            createdBy: userId
          });

          imported.push(result);
        } catch (err) {
          errors.push({ row: rowNum, message: err.message });
        }
      }

      return { imported: imported.length, errors };
    },

    /* ══════════════════════════════════════════
       INVOICES — admin listing
       ══════════════════════════════════════════ */

    async listAllInvoices() {
      const invoices = await adminRepo.listAllInvoices();
      const invoiceIds = invoices.map((inv) => inv.invoiceId);
      const lines = await adminRepo.invoiceLines(invoiceIds);

      const linesByInvoiceId = {};
      for (const line of lines) {
        if (!linesByInvoiceId[line.invoiceId]) {
          linesByInvoiceId[line.invoiceId] = [];
        }
        linesByInvoiceId[line.invoiceId].push(line);
      }

      return invoices.map((inv) => ({
        ...inv,
        lines: linesByInvoiceId[inv.invoiceId] || []
      }));
    }
  };
}
