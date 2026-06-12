import { post } from "../client.js";

export function createSrn({ warehouseId, invoiceId, returnProductIds, signal }) {
  return post("/idm-04/srns", { warehouseId, invoiceId: invoiceId ? Number(invoiceId) : null, returnProductIds }, { signal });
}

export function scanSrnSerial({ srnId, serialNo, conditionTag, signal }) {
  return post(`/idm-04/srns/${srnId}/scans`, { serialNo, conditionTag }, { signal });
}
