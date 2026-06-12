import { get, post } from "../client.js";

export function createDispatch({ invoiceId, warehouseId, signal }) {
  return post("/idm-05/dispatches", { invoiceId, warehouseId }, { signal });
}

export function fetchDispatchAvailability({ invoiceId, warehouseId, signal }) {
  const params = new URLSearchParams();
  if (invoiceId) params.set("invoiceId", invoiceId);
  if (warehouseId) params.set("warehouseId", warehouseId);
  return get(`/idm-05/dispatches/availability?${params.toString()}`, { signal });
}

export function scanDispatchSerial({ dispatchId, serialNo, signal }) {
  return post(`/idm-05/dispatches/${dispatchId}/scans`, { serialNo }, { signal });
}

export function completeDispatch({ dispatchId, signal }) {
  return post(`/idm-05/dispatches/${dispatchId}/complete`, {}, { signal });
}
