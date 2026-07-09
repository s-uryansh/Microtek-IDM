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
           s.missing_received_at AS "missingReceivedAt",
           p.mrp AS "price"
         FROM ageing_serial_snapshot s
         LEFT JOIN product p ON p.product_id = s.product_id
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

    async findProductsInBucket({ warehouseId, minAgeDays, maxAgeDays }) {
      const conditions = ["s.warehouse_id = $1", "s.current_status = 'IN_STOCK'"];
      const values = [warehouseId];

      if (minAgeDays !== null && minAgeDays !== undefined) {
        conditions.push(`s.age_days >= $${values.length + 1}`);
        values.push(minAgeDays);
      }
      if (maxAgeDays !== null && maxAgeDays !== undefined) {
        conditions.push(`s.age_days <= $${values.length + 1}`);
        values.push(maxAgeDays);
      }
      if (minAgeDays === null && maxAgeDays === null) {
        conditions.push("s.age_days IS NULL");
      }

      const result = await pool.query(`
        SELECT
          s.serial_id AS "serialId",
          s.serial_no AS "serialNo",
          s.product_id AS "productId",
          p.product_code AS "productCode",
          p.name AS "productName",
          p.segment,
          p.category,
          p.mrp AS "price",
          s.age_days AS "ageDays",
          s.received_at AS "receivedAt"
        FROM ageing_serial_snapshot s
        JOIN product p ON p.product_id = s.product_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY p.category, p.product_code, s.serial_no`,
        values
      );

      return result.rows;
    },

    async findSummaryByWarehouse({ warehouseIds = [] } = {}) {
      // An empty warehouseIds array collapses the filter to TRUE (all
      // warehouses) and is only passed for admins; non-admins are always
      // scoped to their assigned warehouses by the route layer.
      const whFilter = warehouseIds.length > 0 ? "s.warehouse_id = ANY($1::bigint[])" : "TRUE";

      const result = await pool.query(
        `SELECT
           s.warehouse_id AS "warehouseId",
           w.code AS "warehouseCode",
           s.age_days
         FROM ageing_serial_snapshot s
         JOIN warehouse w ON w.warehouse_id = s.warehouse_id
         WHERE ${whFilter}
         ORDER BY s.warehouse_id`,
        warehouseIds.length > 0 ? [warehouseIds] : []
      );

      return result.rows;
    }
  };
}
