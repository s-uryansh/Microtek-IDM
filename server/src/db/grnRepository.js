export function createGrnRepository(pool) {
  return {
    async create({ receivingWarehouseId, createdBy }) {
      // Warehouse-scoped GRN: stock is received into the warehouse, not against a
      // single SAP dispatch document, so sap_dispatch_doc_id is left NULL.
      const result = await pool.query(
        `INSERT INTO grn (receiving_warehouse_id, created_by)
         VALUES ($1, $2)
         RETURNING
           grn_id AS "grnId",
           sap_dispatch_doc_id AS "sapDispatchDocId",
           receiving_warehouse_id AS "receivingWarehouseId",
           status`,
        [receivingWarehouseId, createdBy]
      );

      return result.rows[0];
    },

    async findById(grnId) {
      const result = await pool.query(
        `SELECT
           grn_id AS "grnId",
           sap_dispatch_doc_id AS "sapDispatchDocId",
           receiving_warehouse_id AS "receivingWarehouseId",
           status
         FROM grn
         WHERE grn_id = $1`,
        [grnId]
      );

      return result.rows[0] ?? null;
    },

    async lockById(grnId) {
      const result = await pool.query(
        `SELECT
           grn_id AS "grnId",
           sap_dispatch_doc_id AS "sapDispatchDocId",
           receiving_warehouse_id AS "receivingWarehouseId",
           status
         FROM grn
         WHERE grn_id = $1
         FOR UPDATE`,
        [grnId]
      );

      return result.rows[0] ?? null;
    },

    async getWarehouseId(grnId) {
      const result = await pool.query("SELECT receiving_warehouse_id AS \"warehouseId\" FROM grn WHERE grn_id = $1", [
        grnId
      ]);

      return result.rows[0]?.warehouseId ?? null;
    },

    async findExpectedLine(grnId, serialId) {
      // Expected = the serial appears in a SAP dispatch record destined for this
      // GRN's receiving warehouse.
      const result = await pool.query(
        `SELECT
           sdl.sap_dispatch_line_id AS "sapDispatchLineId",
           sdl.serial_id AS "serialId",
           sdl.product_id AS "productId",
           sdd.destination_warehouse_id AS "destinationWarehouseId",
           sdd.source_warehouse_id AS "sourceWarehouseId"
         FROM grn g
         JOIN sap_dispatch_doc sdd ON sdd.destination_warehouse_id = g.receiving_warehouse_id
         JOIN sap_dispatch_line sdl ON sdl.sap_dispatch_doc_id = sdd.sap_dispatch_doc_id
         WHERE g.grn_id = $1
           AND sdl.serial_id = $2
         LIMIT 1`,
        [grnId, serialId]
      );

      return result.rows[0] ?? null;
    },

    async findSerialInOtherDispatch(grnId, serialId) {
      // The serial is in a SAP dispatch record, but destined for a different warehouse.
      const result = await pool.query(
        `SELECT
           sdl.serial_id AS "serialId",
           sdd.destination_warehouse_id AS "destinationWarehouseId"
         FROM sap_dispatch_line sdl
         JOIN sap_dispatch_doc sdd ON sdd.sap_dispatch_doc_id = sdl.sap_dispatch_doc_id
         JOIN grn g ON g.grn_id = $1
         WHERE sdl.serial_id = $2
           AND sdd.destination_warehouse_id <> g.receiving_warehouse_id
         LIMIT 1`,
        [grnId, serialId]
      );

      return result.rows[0] ?? null;
    },

    async findScanBySerial(grnId, serialId) {
      const result = await pool.query(
        `SELECT grn_scan_id AS "grnScanId", serial_id AS "serialId"
         FROM grn_scan
         WHERE grn_id = $1 AND serial_id = $2`,
        [grnId, serialId]
      );

      return result.rows[0] ?? null;
    },

    async insertScan({ grnId, serialId, serialNo, matchStatus, scannedBy, createdBy }) {
      const result = await pool.query(
        `INSERT INTO grn_scan (grn_id, serial_id, serial_no, match_status, scanned_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING
           grn_scan_id AS "grnScanId",
           grn_id AS "grnId",
           serial_id AS "serialId",
           match_status AS "matchStatus"`,
        [grnId, serialId ?? null, serialNo, matchStatus, scannedBy, createdBy]
      );

      return result.rows[0] ?? null;
    },

    async updateStatus(grnId, status, updatedBy) {
      await pool.query(
        `UPDATE grn
         SET status = $2,
             completed_at = CASE WHEN $2::varchar IN ('MATCHED', 'EXCEPTION', 'CLOSED') THEN now() ELSE completed_at END,
             updated_at = now(),
             updated_by = $3
         WHERE grn_id = $1`,
        [grnId, status, updatedBy]
      );
    },

    async summarize(grnId) {
      const result = await pool.query(
        `SELECT
           COUNT(*)::int AS "scannedCount",
           COUNT(*) FILTER (WHERE match_status = 'MATCHED')::int AS "matchedCount",
           COUNT(*) FILTER (WHERE match_status <> 'MATCHED')::int AS "exceptionCount"
         FROM grn_scan
         WHERE grn_id = $1`,
        [grnId]
      );

      return result.rows[0] ?? { scannedCount: 0, matchedCount: 0, exceptionCount: 0 };
    }
  };
}
