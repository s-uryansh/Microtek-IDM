export function createReconciliationService({ repositories }) {
  return {
    async getOpeningStockVariance({ warehouseIds, productId }) {
      return repositories.reconciliationReports.findLatestOpeningStockVariance({
        warehouseIds,
        productId
      });
    }
  };
}
