export function createAgeingReportRepository(pool) {
  return {
    async findOnHandSerials({ warehouseIds, productId, limit = 50, offset = 0 }) {
      const values = [warehouseIds];
      const productFilter = productId ? "AND s.product_id = $2" : "";

      if (productId) {
        values.push(productId);
      }

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM ageing_serial_snapshot s
         WHERE s.warehouse_id = ANY($1::bigint[])
         ${productFilter}`,
        values
      );

      const limitIndex = values.length + 1;
      const offsetIndex = values.length + 2;

      const result = await pool.query(
        `SELECT
           s.serial_id AS "serialId",
           s.serial_no AS "serialNo",
           s.warehouse_id AS "warehouseId",
           s.product_id AS "productId",
           s.age_days AS "ageDays",
           s.missing_received_at AS "missingReceivedAt"
         FROM ageing_serial_snapshot s
         WHERE s.warehouse_id = ANY($1::bigint[])
         ${productFilter}
         ORDER BY s.warehouse_id, s.product_id, s.age_days NULLS LAST
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...values, limit, offset]
      );

      return { rows: result.rows, total: countResult.rows[0].total };
    },

    async findSerialsForExport({ warehouseIds, limit = 1000, offset = 0 }) {
      const values = [warehouseIds];
      const whFilter = warehouseIds.length > 0 ? "s.warehouse_id = ANY($1::bigint[])" : "TRUE";
      const limitIndex = values.length + 1;
      const offsetIndex = values.length + 2;

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM ageing_serial_snapshot s
         WHERE ${whFilter}`,
        values
      );

      const result = await pool.query(
        `SELECT
           s.serial_no AS "serialNo",
           p.product_code AS "productCode",
           s.warehouse_id AS "warehouseId",
           s.received_at AS "receivedAt",
           s.age_days AS "ageDays",
           s.missing_received_at AS "missingReceivedAt"
         FROM ageing_serial_snapshot s
         JOIN product p ON p.product_id = s.product_id
         WHERE ${whFilter}
         ORDER BY s.warehouse_id, p.product_code, s.serial_no
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...values, limit, offset]
      );

      return { rows: result.rows, total: countResult.rows[0].total };
    },

    async findSerialsByWarehouseForExport({ warehouseId, limit = 1000, offset = 0 }) {
      const values = [warehouseId];
      const limitIndex = values.length + 1;
      const offsetIndex = values.length + 2;

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM ageing_serial_snapshot s
         WHERE s.warehouse_id = $1`,
        [warehouseId]
      );

      const result = await pool.query(
        `SELECT
           s.serial_no AS "serialNo",
           p.product_code AS "productCode",
           s.warehouse_id AS "warehouseId",
           s.received_at AS "receivedAt",
           s.age_days AS "ageDays",
           s.missing_received_at AS "missingReceivedAt"
         FROM ageing_serial_snapshot s
         JOIN product p ON p.product_id = s.product_id
         WHERE s.warehouse_id = $1
         ORDER BY p.product_code, s.serial_no
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...values, limit, offset]
      );

      return { rows: result.rows, total: countResult.rows[0].total };
    },

    async findSummaryByWarehouse() {
      const result = await pool.query(
        `SELECT
           s.warehouse_id AS "warehouseId",
           w.code AS "warehouseCode",
           s.age_days
         FROM ageing_serial_snapshot s
         JOIN warehouse w ON w.warehouse_id = s.warehouse_id
         ORDER BY s.warehouse_id`
      );

      return result.rows;
    }
  };
}
