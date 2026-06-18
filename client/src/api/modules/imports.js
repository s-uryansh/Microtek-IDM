import { post } from "../client.js";

export function importProduction({ externalRef, source, records, signal }) {
  return post("/idm-01/import/production", { externalRef, source, records }, { signal });
}

export function importProductionCsv({ csvContent, externalRef, source, sourceLabel, signal }) {
  return post("/idm-01/import/production/csv", { csvContent, externalRef, source, sourceLabel }, { signal });
}
