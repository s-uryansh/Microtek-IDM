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

export function scanDispatchSerial({ dispatchId, serialNo, productId, signal }) {
  return post(`/idm-05/dispatches/${dispatchId}/scans`, { serialNo, productId }, { signal });
}

export function completeDispatch({ dispatchId, signal }) {
  return post(`/idm-05/dispatches/${dispatchId}/complete`, {}, { signal });
}

/* ── Warehouse-to-warehouse transfer (invoice-gated, like customer dispatch) ── */
export function createWarehouseTransfer({ sourceWarehouseId, destinationWarehouseId, reference, invoiceId, signal }) {
  return post(
    "/idm-05/transfers",
    { warehouseId: sourceWarehouseId, destinationWarehouseId, reference, invoiceId },
    { signal }
  );
}

export function scanTransferSerial({ transferId, serialNo, productId, signal }) {
  return post(`/idm-05/transfers/${transferId}/scans`, { serialNo, productId }, { signal });
}
