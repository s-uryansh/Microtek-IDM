// Small normalization/parsing helpers shared across the admin sub-services
// (warehouses, roles, members, products, invoices).

export function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function csvCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function csvNumber(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function csvInteger(value) {
  const number = csvNumber(value);
  return number === null ? null : Math.trunc(number);
}

export function csvDate(value) {
  // Pass the trimmed date string straight to Postgres (DATE column casts it);
  // blank cells become NULL.
  return normalizeText(value) || null;
}

export function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
}

export function normalizePermissionCodes(permissionCodes) {
  const codes = Array.isArray(permissionCodes) ? permissionCodes : [];
  return [...new Set(codes.map((code) => String(code).trim()).filter(Boolean))];
}
