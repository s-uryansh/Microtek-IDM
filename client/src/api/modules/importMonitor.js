import { get, post } from "../client.js";

export function listBatches({ limit, offset, sourceLabel, signal } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit);
  if (offset) params.set("offset", offset);
  if (sourceLabel) params.set("sourceLabel", sourceLabel);
  return get(`/idm-01/import/batches?${params.toString()}`, { signal });
}

export function getBatch(batchId, { signal } = {}) {
  return get(`/idm-01/import/batches/${batchId}`, { signal });
}

export function importProduction({ externalRef, source, records, signal }) {
  return post("/idm-01/import/production", { externalRef, source, records }, { signal });
}

export function scanSapReceipt({ serialNo, receivingWarehouseId, signal }) {
  return post("/idm-01/import/receipts/scans", { serialNo, receivingWarehouseId }, { signal });
}

export function fetchAgeingSummary({ signal } = {}) {
  return get("/idm-08/ageing/summary", { signal });
}
