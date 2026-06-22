import { get } from "../client.js";

export function fetchDashboardSummary({ signal } = {}) {
  return get("/idm-00/dashboard/summary", { signal });
}
