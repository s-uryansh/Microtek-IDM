import { post, get } from "../client.js";

export function commitBatterySerial({ invoiceLineId, serialNo, signal }) {
  return post("/idm-03/battery/commit", { invoiceLineId, serialNo }, { signal });
}

export function fetchBatteryCommitStatus({ invoiceId, signal }) {
  return get(`/idm-03/battery/invoices/${invoiceId}/status`, { signal });
}
