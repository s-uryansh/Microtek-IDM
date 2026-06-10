import { get, post, patch } from "../client.js";

/* ── Warehouses ── */
export function fetchWarehouses({ signal } = {}) {
  return get("/admin/warehouses", { signal });
}

export function fetchPermissions({ signal } = {}) {
  return get("/admin/permissions", { signal });
}

export function fetchRoles({ signal } = {}) {
  return get("/admin/roles", { signal });
}

export function createRole({ code, name, permissionCodes, signal }) {
  return post("/admin/roles", { code, name, permissionCodes }, { signal });
}

export function updateRole({ roleId, name, isActive, permissionCodes, signal }) {
  return patch(`/admin/roles/${roleId}`, { name, isActive, permissionCodes }, { signal });
}

export function fetchMembers({ query, signal } = {}) {
  return get(`/admin/members${query ? `?query=${encodeURIComponent(query)}` : ""}`, { signal });
}

export function fetchMember({ userId, signal } = {}) {
  return get(`/admin/members/${userId}`, { signal });
}

export function createMember({
  externalRef,
  username,
  displayName,
  password,
  roleId,
  defaultWarehouseId,
  warehouseIds,
  isActive,
  signal
}) {
  return post(
    "/admin/members",
    { externalRef, username, displayName, password, roleId, defaultWarehouseId, warehouseIds, isActive },
    { signal }
  );
}

export function updateMember({
  userId,
  externalRef,
  username,
  displayName,
  password,
  roleId,
  defaultWarehouseId,
  warehouseIds,
  isActive,
  signal
}) {
  return patch(
    `/admin/members/${userId}`,
    { externalRef, username, displayName, password, roleId, defaultWarehouseId, warehouseIds, isActive },
    { signal }
  );
}

export function createWarehouse({ code, name, type, signal }) {
  return post("/admin/warehouses", { code, name, type }, { signal });
}

export function deactivateWarehouse(warehouseId, { signal } = {}) {
  return post(`/admin/warehouses/${warehouseId}/deactivate`, {}, { signal });
}

export function reactivateWarehouse(warehouseId, { signal } = {}) {
  return post(`/admin/warehouses/${warehouseId}/reactivate`, {}, { signal });
}

/* ── Products ── */
export function fetchProducts({ signal } = {}) {
  return get("/admin/products", { signal });
}

export function exportProductsCsv({ signal } = {}) {
  return get("/admin/products/export", { signal });
}

export function importProductsCsv({ csvContent, signal }) {
  return post("/admin/products/import", { csvContent }, { signal });
}

/* ── Invoices ── */
export function fetchAllInvoices({ signal } = {}) {
  return get("/admin/invoices", { signal });
}
