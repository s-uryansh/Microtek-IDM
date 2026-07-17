import { post, get } from "../client.js";

export function createGrn({ warehouseId, dispatchRef, signal }) {
  return post("/idm-02/grns", { warehouseId, dispatchRef }, { signal });
}

export function scanGrnSerial({ grnId, serialNo, productId, signal }) {
  return post(`/idm-02/grns/${grnId}/scans`, { serialNo, productId }, { signal });
}

export function completeGrn({ grnId, signal }) {
  return post(`/idm-02/grns/${grnId}/complete`, {}, { signal });
}

export function getGrn({ grnId, signal }) {
  return get(`/idm-02/grns/${grnId}`, { signal });
}
