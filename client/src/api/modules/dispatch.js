import { post } from "../client.js";

export function createDispatch({ invoiceId, warehouseId, signal }) {
  return post("/idm-05/dispatches", { invoiceId, warehouseId }, { signal });
}

export function scanDispatchSerial({ dispatchId, invoiceLineId, serialNo, signal }) {
  return post(`/idm-05/dispatches/${dispatchId}/scans`, { invoiceLineId, serialNo }, { signal });
}

export function completeDispatch({ dispatchId, signal }) {
  return post(`/idm-05/dispatches/${dispatchId}/complete`, {}, { signal });
}
