import { get, post } from "../client.js";

// Serials on condition hold (DEFECTIVE/REPAIR), scoped server-side to the
// caller's warehouses.
export function fetchHeldStock({ signal } = {}) {
  return get("/idm-04/condition/held", { signal });
}

// Retag a held serial (e.g. back to SALEABLE) so it can be dispatched again.
export function correctConditionTag({ serialNo, conditionTag, signal }) {
  return post("/idm-04/condition/correct", { serialNo, conditionTag }, { signal });
}
