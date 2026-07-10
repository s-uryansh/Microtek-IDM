import {
  productionRecordSchema,
  qrOnlyRecordSchema
} from "../../models/importSchemas.js";

function mapValidationError(error) {
  const issue = error.issues[0];
  return issue?.code === "invalid_string" || issue?.code === "invalid_format"
    ? "MALFORMED_SERIAL"
    : "INVALID_RECORD";
}

function pickFirst(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return undefined;
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function parseQrCode(qrCode) {
  if (!qrCode) return {};

  try {
    const parsed = JSON.parse(qrCode);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const entries = {};
    const params = new URLSearchParams(qrCode.includes("?") ? qrCode.split("?").at(-1) : qrCode);
    for (const [key, value] of params.entries()) {
      entries[key] = value;
    }
    return entries;
  }
}

function normalizeRecord(rawInput) {
  const input = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) ? rawInput : {};
  const qrData = qrOnlyRecordSchema.safeParse(input).success ? parseQrCode(input.qrCode) : {};
  const merged = { ...qrData, ...input };
  const sourceWarehouseId = toPositiveInteger(
    pickFirst(merged, ["sourceWarehouseId", "sourceWarehouse", "dispatchedFromWarehouseId", "fromWarehouseId"])
  );
  const destinationWarehouseId = toPositiveInteger(
    pickFirst(merged, ["destinationWarehouseId", "destinationWarehouse", "warehouseId", "toWarehouseId"])
  );

  return {
    serialNo: String(pickFirst(merged, ["serialNo", "serial", "serialNumber"]) ?? "").trim(),
    productCode: String(pickFirst(merged, ["productCode", "sku", "materialCode"]) ?? "").trim(),
    batchNo: pickFirst(merged, ["batchNo", "batch", "batchNumber"]),
    warehouseId: destinationWarehouseId,
    sourceWarehouseId,
    destinationWarehouseId,
    qrCode: input.qrCode,
    sourceInvoiceRef: pickFirst(merged, ["sourceInvoiceRef", "invoiceRef", "dispatchRef"])
  };
}

// Per-row validation shared by importProductionBatch (which needs the parsed
// record to carry forward) and the public validateProductionRecord method.
export function validateProductionRecord(rawRecord) {
  const normalized = normalizeRecord(rawRecord);
  const parsed = productionRecordSchema.safeParse(normalized);

  if (parsed.success) {
    return { valid: true, reason: null, serialNo: parsed.data.serialNo, record: parsed.data };
  }

  return {
    valid: false,
    reason: mapValidationError(parsed.error),
    serialNo: normalized.serialNo || null,
    record: null
  };
}
