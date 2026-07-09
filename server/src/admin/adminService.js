import { parse } from "csv-parse/sync";
import { z } from "zod";

import { hashPassword } from "../auth/password.js";
import { sanitizeCsvCell } from "../utils/sanitizeCsvCell.js";
import { availablePermissionCodes } from "../security/rbacPolicy.js";

const VALID_WAREHOUSE_TYPES = ["PLANT", "CENTRAL", "REGIONAL"];

// Bound a single product import so one request cannot tie up a worker with an
// unbounded number of sequential upserts.
const MAX_PRODUCT_IMPORT_ROWS = 5000;

// Validate each imported product row: constrains code shape and field lengths so
// oversized/garbage values never reach the database (or the export CSV). Matches
// the four columns the client's CSV marks required with (*).
const productImportRowSchema = z.object({
  productCode: z.string().regex(/^[A-Z0-9._-]{1,64}$/, "Product Code(*) must be 1-64 chars of A-Z 0-9 . _ -"),
  name: z.string().min(1, "Product Name(*) is required").max(200, "Product Name(*) must be at most 200 characters"),
  category: z.string().min(1, "Category(*) is required").max(60, "Category(*) must be at most 60 characters"),
  subCategory: z.string().min(1, "Sub Category(*) is required").max(60, "Sub Category(*) must be at most 60 characters")
});

// The client's product export uses its own literal column headers (with "(*)"
// suffixes, spaces, and even a typo — "Warraanty"). Map them to internal field
// names instead of asking the client to reformat their file.
const PRODUCT_CSV_FIELD_ALIASES = {
  productCode: ["product code(*)"],
  name: ["product name(*)"],
  category: ["category(*)"],
  subCategory: ["sub category(*)"],
  distributorPrice: ["distributor price"],
  warranty: ["warraanty"],
  gst: ["gst"],
  mrp: ["mrp"],
  basePrice: ["base price"],
  stock: ["stock"],
  sbu: ["sbu"],
  poll: ["poll"],
  moq: ["moq"],
  description: ["description"],
  productCategory: ["product category"]
};

function mapProductRow(row) {
  const byNormalizedKey = new Map(
    Object.entries(row).map(([key, value]) => [String(key || "").trim().toLowerCase(), value])
  );
  const mapped = {};
  for (const [field, aliases] of Object.entries(PRODUCT_CSV_FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (byNormalizedKey.has(alias)) {
        mapped[field] = byNormalizedKey.get(alias);
        break;
      }
    }
  }
  return mapped;
}

// Modifiable: is_battery is derived by matching category/sub-category/product
// category text against this keyword list, rather than a fixed category enum —
// the client's category codes (e.g. "PSD") aren't a known fixed set.
const BATTERY_CATEGORY_KEYWORDS = ["BATTERY"];

function looksLikeBattery(...values) {
  return values.some((value) =>
    BATTERY_CATEGORY_KEYWORDS.some((keyword) => String(value || "").toUpperCase().includes(keyword))
  );
}

// Flat CSV: one row per invoice line, with the invoice header columns repeated on
// every line of the same invoice (grouped on import by sap_invoice_ref).
const INVOICE_CSV_HEADERS = [
  "sap_invoice_ref", "status",
  "order_id", "customer_name", "customer_code", "billing_date", "billing_number", "division",
  "total_sale_qty", "item_total", "total_amt", "transport_name", "lr_no", "lr_date",
  "dispatch_date", "delivery_date", "sales_order_qty", "pod_status",
  "line_no", "material_code", "bill_qty", "uom", "amount", "pod_section", "pod_document"
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function csvCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function csvNumber(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function csvInteger(value) {
  const number = csvNumber(value);
  return number === null ? null : Math.trunc(number);
}

function csvDate(value) {
  // Pass the trimmed date string straight to Postgres (DATE column casts it);
  // blank cells become NULL.
  return normalizeText(value) || null;
}

function invoiceHeaderCells(inv) {
  return [
    inv.sapInvoiceRef,
    inv.status,
    inv.orderId,
    inv.customerName,
    inv.customerCode,
    inv.billingDate,
    inv.billingNumber,
    inv.division,
    inv.totalSaleQty,
    inv.itemTotal,
    inv.totalAmt,
    inv.transportName,
    inv.lrNo,
    inv.lrDate,
    inv.dispatchDate,
    inv.deliveryDate,
    inv.salesOrderQty,
    inv.podStatus
  ].map(csvCellValue);
}

function invoiceLineCells(line) {
  return [
    line.lineNo,
    line.productCode,
    line.quantity,
    line.uom,
    line.amount,
    line.podSection,
    line.podDocument
  ].map(csvCellValue);
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
    /* 
       WAREHOUSES
*/

    async listWarehouseStock() {
      return adminRepo.listWarehouseStock();
    },

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

    /* 
       ROLES
*/

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

    /* 
       MEMBERS
*/

    async listMembers({ query } = {}) {
      return adminRepo.listMembers({ query });
    },

    async getMemberById(userId) {
      return adminRepo.getMemberById(userId);
    },

    // Soft delete: mark the member as no longer with the company. They keep all
    // their history but can no longer log in (login checks is_active).
    async deactivateMember(userId, updatedBy) {
      const member = await adminRepo.getMemberById(userId);
      if (!member) {
        throw Object.assign(new Error("Member not found"), { status: 404 });
      }
      return adminRepo.toggleMemberActive(userId, false, updatedBy);
    },

    async reactivateMember(userId, updatedBy) {
      const member = await adminRepo.getMemberById(userId);
      if (!member) {
        throw Object.assign(new Error("Member not found"), { status: 404 });
      }
      return adminRepo.toggleMemberActive(userId, true, updatedBy);
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

    /* 
       PRODUCTS — CSV IMPORT / EXPORT
*/

    async listProducts() {
      return adminRepo.listProducts();
    },

    async exportProductsCsv() {
      const products = await adminRepo.listProducts();
      const headerToField = {
        "Product Code(*)": "productCode",
        "Product Name(*)": "name",
        "Category(*)": "category",
        "Sub Category(*)": "subCategory",
        "Distributor Price": "distributorPrice",
        "Warraanty": "warranty",
        "Gst": "gst",
        "Mrp": "mrp",
        "Base Price": "basePrice",
        "Stock": "stock",
        "SBU": "sbu",
        "Poll": "poll",
        "MOQ": "moq",
        "Description": "description",
        "Product Category": "productCategory"
      };
      const headers = Object.keys(headerToField);
      const headerLine = headers.map(sanitizeCsvCell).join(",");
      const bodyLines = products.map((p) =>
        headers.map((h) => sanitizeCsvCell(String(p[headerToField[h]] ?? ""))).join(",")
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
        return { imported: 0, errors: [], warnings: [] };
      }

      if (records.length > MAX_PRODUCT_IMPORT_ROWS) {
        throw Object.assign(
          new Error(`Too many rows: ${records.length} (max ${MAX_PRODUCT_IMPORT_ROWS} per import).`),
          { status: 400 }
        );
      }

      const errors = [];
      const warnings = [];
      const imported = [];
      const seenCodes = new Set();

      for (let i = 0; i < records.length; i++) {
        const row = mapProductRow(records[i]);
        const rowNum = i + 2;

        try {
          const productCode = normalizeText(row.productCode).toUpperCase();
          const name = normalizeText(row.name);
          const category = normalizeText(row.category).toUpperCase();
          const subCategory = normalizeText(row.subCategory).toUpperCase();

          const parsed = productImportRowSchema.safeParse({ productCode, name, category, subCategory });
          if (!parsed.success) {
            errors.push({ row: rowNum, message: parsed.error.issues[0]?.message ?? "Invalid product row" });
            continue;
          }

          if (seenCodes.has(productCode)) {
            warnings.push({ row: rowNum, message: `Duplicate product_code "${productCode}" in file — overwrote an earlier row.` });
          }
          seenCodes.add(productCode);

          const productCategory = normalizeText(row.productCategory).toUpperCase() || category;
          const isBattery = looksLikeBattery(category, subCategory, productCategory);

          const result = await adminRepo.upsertProduct({
            productCode,
            name,
            segment: category, // the client's CSV has no dedicated segment column; mirrors category
            category,
            subCategory,
            productCategory,
            distributorPrice: csvNumber(row.distributorPrice),
            warranty: normalizeText(row.warranty) || null,
            gst: csvNumber(row.gst),
            mrp: csvNumber(row.mrp),
            basePrice: csvNumber(row.basePrice),
            stock: csvInteger(row.stock),
            sbu: normalizeText(row.sbu) || null,
            poll: normalizeText(row.poll) || null,
            moq: csvInteger(row.moq),
            description: normalizeText(row.description) || null,
            isBattery,
            createdBy: userId
          });

          imported.push(result);
        } catch (err) {
          // Never surface raw DB driver messages (they leak schema details).
          if (err.status) {
            throw err;
          }
          errors.push({ row: rowNum, message: "Failed to import row" });
        }
      }

      return { imported: imported.length, errors, warnings };
    },

    /* 
       INVOICES — admin listing
*/

    async listAllInvoices({ query } = {}) {
      const invoices = await adminRepo.listAllInvoices({ query });
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
    },

    /* 
       INVOICES — admin-only CSV import / export
*/

    async exportInvoicesCsv() {
      const invoices = await this.listAllInvoices();
      const headerLine = INVOICE_CSV_HEADERS.map(sanitizeCsvCell).join(",");

      const bodyLines = [];
      for (const inv of invoices) {
        const header = invoiceHeaderCells(inv);
        const lines = inv.lines || [];
        if (lines.length === 0) {
          bodyLines.push([...header, "", "", "", "", "", "", ""].map(sanitizeCsvCell).join(","));
          continue;
        }
        for (const line of lines) {
          bodyLines.push(
            [...header, ...invoiceLineCells(line)].map(sanitizeCsvCell).join(",")
          );
        }
      }

      return [headerLine, ...bodyLines].join("\n");
    },

    async importInvoicesCsv({ csvContent, userId }) {
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
        return { imported: 0, importedLines: 0, errors: [] };
      }

      const errors = [];
      const groups = new Map();

      records.forEach((row, i) => {
        const rowNum = i + 2;
        const ref = normalizeText(row.sap_invoice_ref);
        if (!ref) {
          errors.push({ row: rowNum, message: "sap_invoice_ref is required" });
          return;
        }
        if (!groups.has(ref)) {
          groups.set(ref, { headerRow: row, headerRowNum: rowNum, lines: [] });
        }
        if (normalizeText(row.material_code)) {
          groups.get(ref).lines.push({ row, rowNum });
        }
      });

      let importedInvoices = 0;
      let importedLines = 0;

      for (const [ref, group] of groups) {
        const header = group.headerRow;
        try {
          const invoice = await adminRepo.upsertInvoice({
            sapInvoiceRef: ref,
            status: normalizeText(header.status).toUpperCase() || "PENDING",
            orderId: normalizeText(header.order_id) || null,
            customerName: normalizeText(header.customer_name) || null,
            customerCode: normalizeText(header.customer_code) || null,
            billingDate: csvDate(header.billing_date),
            billingNumber: normalizeText(header.billing_number) || null,
            division: normalizeText(header.division) || null,
            totalSaleQty: csvNumber(header.total_sale_qty),
            itemTotal: csvInteger(header.item_total),
            totalAmt: csvNumber(header.total_amt),
            transportName: normalizeText(header.transport_name) || null,
            lrNo: normalizeText(header.lr_no) || null,
            lrDate: csvDate(header.lr_date),
            dispatchDate: csvDate(header.dispatch_date),
            deliveryDate: csvDate(header.delivery_date),
            salesOrderQty: csvNumber(header.sales_order_qty),
            podStatus: normalizeText(header.pod_status) || null,
            createdBy: userId
          });
          importedInvoices += 1;

          for (const { row, rowNum } of group.lines) {
            const materialCode = normalizeText(row.material_code).toUpperCase();
            const product = await adminRepo.getProductByCode(materialCode);
            if (!product) {
              errors.push({ row: rowNum, message: `Unknown material code: ${materialCode}` });
              continue;
            }
            const lineNo = csvInteger(row.line_no);
            const billQty = csvInteger(row.bill_qty);
            if (!Number.isInteger(lineNo) || lineNo <= 0) {
              errors.push({ row: rowNum, message: "line_no must be a positive integer" });
              continue;
            }
            if (!Number.isInteger(billQty) || billQty <= 0) {
              errors.push({ row: rowNum, message: "bill_qty must be a positive integer" });
              continue;
            }

            await adminRepo.upsertInvoiceLine({
              invoiceId: invoice.invoiceId,
              lineNo,
              productId: product.productId,
              requiredQuantity: billQty,
              uom: normalizeText(row.uom) || null,
              amount: csvNumber(row.amount),
              podSection: normalizeText(row.pod_section) || null,
              podDocument: normalizeText(row.pod_document) || null,
              createdBy: userId
            });
            importedLines += 1;
          }
        } catch (err) {
          errors.push({ row: group.headerRowNum, message: `${ref}: ${err.message}` });
        }
      }

      return { imported: importedInvoices, importedLines, errors };
    },

    /* 
       INBOUND STOCK — which stock was sent to which warehouse
       (SAP dispatch documents + their serials)
*/

    async listInboundDispatches() {
      const docs = await adminRepo.listDispatchDocs();
      const lines = await adminRepo.dispatchDocLines(docs.map((doc) => doc.sapDispatchDocId));

      const linesByDoc = {};
      for (const line of lines) {
        (linesByDoc[line.sapDispatchDocId] ||= []).push(line);
      }

      return docs.map((doc) => {
        const docLines = linesByDoc[doc.sapDispatchDocId] || [];
        // Per-product roll-up: name/code with quantity (serial count).
        const productMap = new Map();
        for (const line of docLines) {
          const entry = productMap.get(line.productCode) || {
            productCode: line.productCode,
            productName: line.productName,
            quantity: 0
          };
          entry.quantity += 1;
          productMap.set(line.productCode, entry);
        }
        return {
          ...doc,
          totalQuantity: docLines.length,
          products: [...productMap.values()],
          lines: docLines
        };
      });
    }
  };
}
