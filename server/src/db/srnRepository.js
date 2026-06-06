export function createSrnRepository(pool) {
  return {
    async create({ receivingWarehouseId, createdBy }) {
      const result = await pool.query(
        `INSERT INTO srn (receiving_warehouse_id, created_by)
         VALUES ($1, $2)
         RETURNING srn_id AS "srnId", receiving_warehouse_id AS "receivingWarehouseId", status`,
        [receivingWarehouseId, createdBy]
      );

      return result.rows[0];
    },

    async findById(srnId) {
      const result = await pool.query(
        `SELECT srn_id AS "srnId", receiving_warehouse_id AS "receivingWarehouseId", status
         FROM srn
         WHERE srn_id = $1`,
        [srnId]
      );

      return result.rows[0] ?? null;
    },

    async lockById(srnId) {
      const result = await pool.query(
        `SELECT srn_id AS "srnId", receiving_warehouse_id AS "receivingWarehouseId", status
         FROM srn
         WHERE srn_id = $1
         FOR UPDATE`,
        [srnId]
      );

      return result.rows[0] ?? null;
    },

    async getWarehouseId(srnId) {
      const result = await pool.query("SELECT receiving_warehouse_id AS \"warehouseId\" FROM srn WHERE srn_id = $1", [
        srnId
      ]);

      return result.rows[0]?.warehouseId ?? null;
    },

    async findOriginalDispatchScan(serialId) {
      const result = await pool.query(
        `SELECT dispatch_scan_id AS "dispatchScanId", serial_id AS "serialId"
         FROM dispatch_scan
         WHERE serial_id = $1
         ORDER BY scanned_at DESC
         LIMIT 1`,
        [serialId]
      );

      return result.rows[0] ?? null;
    },

    async hasReturnedSerial(serialId) {
      const result = await pool.query("SELECT 1 FROM srn_scan WHERE serial_id = $1 LIMIT 1", [serialId]);
      return result.rowCount > 0;
    },

    async insertScan({ srnId, serialId, originalDispatchScanId, conditionTag, scannedBy, createdBy }) {
      const result = await pool.query(
        `INSERT INTO srn_scan (
           srn_id,
           serial_id,
           original_dispatch_scan_id,
           condition_tag,
           scanned_by,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING srn_scan_id AS "srnScanId"`,
        [srnId, serialId, originalDispatchScanId ?? null, conditionTag, scannedBy, createdBy]
      );

      return result.rows[0] ?? null;
    }
  };
}
