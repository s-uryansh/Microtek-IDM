import { get } from "../client.js";

export function fetchDashboardSummary({ warehouseId, signal } = {}) {
  const query =
    warehouseId !== undefined && warehouseId !== null && warehouseId !== ""
      ? `?warehouseId=${encodeURIComponent(warehouseId)}`
      : "";
  return get(`/idm-00/dashboard/summary${query}`, { signal });
}
