export function normalizePermissionRows(rows) {
  return rows.map((row) => row.permissionCode).filter(Boolean);
}

// Escape LIKE/ILIKE wildcards so a search term is matched literally (the values
// are already passed as parameters; this only fixes match semantics, not safety).
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}
