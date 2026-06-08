function scopedWarehouses({ requestedWarehouseId, userWarehouseIds, role }) {
  if (role === "admin" && requestedWarehouseId) return [requestedWarehouseId];
  if (role === "admin") return userWarehouseIds;
  if (!requestedWarehouseId) return userWarehouseIds;
  return userWarehouseIds.includes(requestedWarehouseId) ? [requestedWarehouseId] : null;
}

export function createLookupService({ repositories }) {
  return {
    async searchInvoices(input) {
      return repositories.lookups.searchInvoices(input);
    },
    async searchDispatchDocs(input) {
      return repositories.lookups.searchDispatchDocs(input);
    },
    async searchDispatches(input) {
      return repositories.lookups.searchDispatches(input);
    },
    async searchWarehouses(input) {
      return repositories.lookups.searchWarehouses(input);
    },
    scopedWarehouses
  };
}
