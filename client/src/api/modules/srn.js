import { post } from "../client.js";

export function createSrn({ warehouseId, signal }) {
  return post("/idm-04/srns", { warehouseId }, { signal });
}

export function scanSrnSerial({ srnId, serialNo, conditionTag, signal }) {
  return post(`/idm-04/srns/${srnId}/scans`, { serialNo, conditionTag }, { signal });
}
