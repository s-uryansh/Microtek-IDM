export function createSrnRepository(pool) {
  return {
    async create({ receivingWarehouseId, invoiceId, returnProductIds, expectedQuantity, createdBy }) {
      const result = await pool.query(
        `INSERT INTO srn (receiving_warehouse_id, invoice_id, return_product_ids, expected_quantity, created_by)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING srn_id AS "srnId", receiving_warehouse_id AS "receivingWarehouseId", invoice_id AS "invoiceId", return_product_ids AS "returnProductIds", expected_quantity AS "expectedQuantity", status`,
        [receivingWarehouseId, invoiceId, JSON.stringify(returnProductIds || []), expectedQuantity ?? null, createdBy]
      );

      return result.rows[0];
    },

    async findById(srnId) {
      const result = await pool.query(
        `SELECT srn_id AS "srnId", receiving_warehouse_id AS "receivingWarehouseId", invoice_id AS "invoiceId", return_product_ids AS "returnProductIds", expected_quantity AS "expectedQuantity", status
         FROM srn
         WHERE srn_id = $1`,
        [srnId]
      );

      return result.rows[0] ?? null;
    },

    async lockById(srnId) {
      const result = await pool.query(
        `SELECT srn_id AS "srnId", receiving_warehouse_id AS "receivingWarehouseId", invoice_id AS "invoiceId", return_product_ids AS "returnProductIds", expected_quantity AS "expectedQuantity", status
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
      // Only serials from a COMPLETED dispatch count as "dispatched and mapped
      // to an invoice" — an in-progress dispatch session is not yet done, so its
      // scans are not a valid origin for a return.
      const result = await pool.query(
        `SELECT ds.dispatch_scan_id AS "dispatchScanId",
                ds.serial_id AS "serialId",
                d.invoice_id AS "invoiceId"
         FROM dispatch_scan ds
         JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
         WHERE ds.serial_id = $1
           AND d.status = 'DISPATCHED'
         ORDER BY ds.scanned_at DESC
         LIMIT 1`,
        [serialId]
      );

      return result.rows[0] ?? null;
    },

    async findOriginalDispatchScanBySerialAndProducts(serialId, productIds) {
      const result = await pool.query(
        `SELECT ds.dispatch_scan_id AS "dispatchScanId",
                ds.serial_id AS "serialId",
                d.invoice_id AS "invoiceId"
         FROM dispatch_scan ds
         JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
         JOIN serial_master sm ON sm.serial_id = ds.serial_id
         WHERE ds.serial_id = $1
           AND sm.product_id = ANY($2::int[])
           AND d.status = 'DISPATCHED'
         ORDER BY ds.scanned_at DESC
         LIMIT 1`,
        [serialId, productIds]
      );

      return result.rows[0] ?? null;
    },

    async invoiceHasDispatchedSerials(invoiceId) {
      // True only when the invoice has at least one serial dispatched through a
      // COMPLETED dispatch — i.e. products were actually mapped to it after
      // dispatch was done. This is the gate for allowing a return (SRN).
      const result = await pool.query(
        `SELECT 1
         FROM dispatch_scan ds
         JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
         WHERE d.invoice_id = $1
           AND d.status = 'DISPATCHED'
         LIMIT 1`,
        [invoiceId]
      );

      return result.rowCount > 0;
    },

    async countReturnableForInvoice(invoiceId) {
      // Units still legitimately returnable for the invoice: serials dispatched
      // through a COMPLETED dispatch that have not already been returned. This is
      // the cumulative cap across all SRNs for the invoice (dispatched − returned).
      const result = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM dispatch_scan ds
         JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
         WHERE d.invoice_id = $1
           AND d.status = 'DISPATCHED'
           AND ds.returned_at IS NULL`,
        [invoiceId]
      );

      return result.rows[0].count;
    },

    async hasReturnedSerial(serialId) {
      const result = await pool.query("SELECT 1 FROM srn_scan WHERE serial_id = $1 LIMIT 1", [serialId]);
      return result.rowCount > 0;
    },

    async countScans(srnId) {
      const result = await pool.query("SELECT COUNT(*)::int AS count FROM srn_scan WHERE srn_id = $1", [srnId]);
      return result.rows[0].count;
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
