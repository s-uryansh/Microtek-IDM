export function createReconciliationRepository(pool) {
  return {
    async findLatestOpeningStockVariance({ warehouseIds, productId }) {
      const values = [warehouseIds];
      const productFilter = productId ? "AND line.product_id = $2" : "";

      if (productId) {
        values.push(productId);
      }

      const result = await pool.query(
        `SELECT
           run.reconciliation_run_id AS "reconciliationRunId",
           run.warehouse_id AS "warehouseId",
           line.product_id AS "productId",
           line.sap_quantity AS "sapQuantity",
           line.idm_quantity AS "idmQuantity",
           line.variance_quantity AS "varianceQuantity"
         FROM opening_stock_reconciliation_run run
         JOIN opening_stock_reconciliation_line line
           ON line.reconciliation_run_id = run.reconciliation_run_id
         WHERE run.warehouse_id = ANY($1::bigint[])
         ${productFilter}
         ORDER BY run.run_at DESC`,
        values
      );

      return {
        rows: result.rows
      };
    }
  };
}
