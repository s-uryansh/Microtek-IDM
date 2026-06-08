export function createAgeingReportRepository(pool) {
  return {
    async findOnHandSerials({ warehouseIds, productId, limit = 50, offset = 0 }) {
      const values = [warehouseIds];
      const productFilter = productId ? "AND product_id = $2" : "";

      if (productId) {
        values.push(productId);
      }

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM ageing_serial_snapshot
         WHERE warehouse_id = ANY($1::bigint[])
         ${productFilter}`,
        values
      );

      const limitIndex = values.length + 1;
      const offsetIndex = values.length + 2;

      const result = await pool.query(
        `SELECT
           serial_id AS "serialId",
           serial_no AS "serialNo",
           warehouse_id AS "warehouseId",
           product_id AS "productId",
           age_days AS "ageDays",
           missing_received_at AS "missingReceivedAt"
         FROM ageing_serial_snapshot
         WHERE warehouse_id = ANY($1::bigint[])
         ${productFilter}
         ORDER BY warehouse_id, product_id, age_days NULLS LAST
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...values, limit, offset]
      );

      return { rows: result.rows, total: countResult.rows[0].total };
    }
  };
}
