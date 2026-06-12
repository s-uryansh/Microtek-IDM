import { get } from "../client.js";

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function searchInvoices({ query, batteryOnly, signal } = {}) {
  return get(`/lookups/invoices${queryString({ query, batteryOnly })}`, { signal });
}

export function searchDispatchDocs({ query, warehouseId, signal } = {}) {
  return get(`/lookups/dispatch-docs${queryString({ query, warehouseId })}`, { signal });
}

export function searchDispatches({ query, warehouseId, signal } = {}) {
  return get(`/lookups/dispatches${queryString({ query, warehouseId })}`, { signal });
}

export function searchWarehouses({ query, signal } = {}) {
  return get(`/lookups/warehouses${queryString({ query })}`, { signal });
}
