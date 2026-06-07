import { get } from "../client.js";

export function fetchFulfilmentStatus({ invoiceId, signal }) {
  return get(`/idm-07/orders/${invoiceId}/status`, { signal });
}
