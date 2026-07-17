// Composed serial identity (see V027__serial_composed_identity.sql).
//
// A serial is stored as `<PRODUCT_PREFIX>_<baseSerial>` — e.g. product
// "Inverter 1KVA" + base "SKU-110E" => "INVERTER_1KVA_SKU-110E". This lets two
// different products carry the same physical base serial (an inverter and a
// controller both stamped "SKU-100E") while keeping serial_no globally unique
// and disambiguating every inventory/warehouse record by product.
//
// The canonical composition lives in the DB trigger; these helpers mirror it for
// the read path and tests. Keep the two in sync.

// Uppercase the product name and collapse every run of non-alphanumerics to a
// single underscore, trimming leading/trailing underscores.
export function productPrefix(productName) {
  return String(productName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function composeSerialNo(productName, baseSerial) {
  const prefix = productPrefix(productName);
  const base = String(baseSerial ?? "").trim();
  return prefix ? `${prefix}_${base}` : base;
}

// Best-effort recovery of the base serial from a composed serial_no when the
// base column is not available. Prefer the stored base_serial column.
export function baseSerialFrom(serialNo, productName) {
  const prefix = productPrefix(productName);
  const value = String(serialNo ?? "");
  if (prefix && value.startsWith(`${prefix}_`)) {
    return value.slice(prefix.length + 1);
  }
  return value;
}
