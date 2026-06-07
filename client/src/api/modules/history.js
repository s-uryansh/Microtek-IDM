import { get } from "../client.js";

export function fetchSerialHistory({ serialNo, signal }) {
  return get(`/idm-09/serials/${encodeURIComponent(serialNo)}/history`, { signal });
}
