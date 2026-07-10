import { parse } from "csv-parse/sync";
import { z } from "zod";

import { sanitizeCsvCell } from "../../utils/sanitizeCsvCell.js";
import { normalizeText, csvNumber, csvInteger } from "./shared.js";

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

export function createProductService({ adminRepo }) {
  return {
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
    }
  };
}
