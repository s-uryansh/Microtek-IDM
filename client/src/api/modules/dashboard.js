import { get } from "../client.js";

export function fetchDashboardSummary({ warehouseId, category, signal } = {}) {
  const params = new URLSearchParams();
  if (warehouseId !== undefined && warehouseId !== null && warehouseId !== "") {
    params.set("warehouseId", warehouseId);
  }
  if (category) {
    params.set("category", category);
  }
  const query = params.toString();
  return get(`/idm-00/dashboard/summary${query ? `?${query}` : ""}`, { signal });
}

export function fetchDashboardCategories({ signal } = {}) {
  return get("/idm-00/dashboard/categories", { signal });
}
