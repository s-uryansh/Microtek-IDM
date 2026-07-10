import { parse } from "csv-parse/sync";

// Manual CSV uploads are bounded well under the JSON body limit (app.js caps the
// request at 1mb). Larger feeds should use the signed SAP webhook on /production.
const MAX_CSV_IMPORT_ROWS = 5000;

// Parse a manually-uploaded CSV into the same row objects importProductionBatch
// already accepts. Header names map straight onto record fields, and
// normalizeRecord handles the column aliases (serial/serialNo, sku/productCode,
// etc.), so no per-column mapping is needed here.
export function parseProductionCsv(csvContent) {
  if (typeof csvContent !== "string" || !csvContent.trim()) {
    throw new Error("CSV content is required");
  }

  let rows;
  try {
    rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true
    });
  } catch (error) {
    throw new Error(`Invalid CSV: ${error.message}`);
  }

  if (rows.length === 0) {
    throw new Error("CSV has no data rows");
  }

  if (rows.length > MAX_CSV_IMPORT_ROWS) {
    throw new Error(`CSV exceeds the ${MAX_CSV_IMPORT_ROWS}-row limit; use the SAP production API for larger batches`);
  }

  return rows;
}
