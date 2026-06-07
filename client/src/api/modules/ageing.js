import { get } from "../client.js";

export function fetchAgeingReport({ warehouseId, productId, signal }) {
  const params = new URLSearchParams();
  if (warehouseId) params.set("warehouseId", warehouseId);
  if (productId) params.set("productId", productId);
  return get(`/idm-08/ageing?${params.toString()}`, { signal });
}

export function fetchReconciliationVariance({ warehouseId, productId, signal }) {
  const params = new URLSearchParams();
  if (warehouseId) params.set("warehouseId", warehouseId);
  if (productId) params.set("productId", productId);
  return get(`/idm-08/reconciliation/opening-stock/variance?${params.toString()}`, { signal });
}
