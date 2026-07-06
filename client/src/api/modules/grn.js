import { post, get } from "../client.js";

export function createGrn({ warehouseId, dispatchRef, signal }) {
  return post("/idm-02/grns", { warehouseId, dispatchRef }, { signal });
}

export function scanGrnSerial({ grnId, serialNo, signal }) {
  return post(`/idm-02/grns/${grnId}/scans`, { serialNo }, { signal });
}

export function completeGrn({ grnId, signal }) {
  return post(`/idm-02/grns/${grnId}/complete`, {}, { signal });
}

export function getGrn({ grnId, signal }) {
  return get(`/idm-02/grns/${grnId}`, { signal });
}
