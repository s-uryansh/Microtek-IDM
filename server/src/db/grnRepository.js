export function createGrnRepository(pool) {
  return {
    async create({ sapDispatchDocId, receivingWarehouseId, createdBy }) {
      const result = await pool.query(
        `INSERT INTO grn (sap_dispatch_doc_id, receiving_warehouse_id, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (sap_dispatch_doc_id) DO UPDATE
         SET updated_at = now(),
             updated_by = EXCLUDED.created_by
         RETURNING
           grn_id AS "grnId",
           sap_dispatch_doc_id AS "sapDispatchDocId",
           receiving_warehouse_id AS "receivingWarehouseId",
           status`,
        [sapDispatchDocId, receivingWarehouseId, createdBy]
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
      const result = await pool.query(
        `SELECT
           sdl.sap_dispatch_line_id AS "sapDispatchLineId",
           sdl.serial_id AS "serialId",
           sdl.product_id AS "productId",
           sdd.destination_warehouse_id AS "destinationWarehouseId",
           sdd.source_warehouse_id AS "sourceWarehouseId"
         FROM grn g
         JOIN sap_dispatch_line sdl ON sdl.sap_dispatch_doc_id = g.sap_dispatch_doc_id
         JOIN sap_dispatch_doc sdd ON sdd.sap_dispatch_doc_id = sdl.sap_dispatch_doc_id
         WHERE g.grn_id = $1
           AND sdl.serial_id = $2`,
        [grnId, serialId]
      );

      return result.rows[0] ?? null;
    },

    async findSerialInOtherDispatch(grnId, serialId) {
      const result = await pool.query(
        `SELECT
           sdl.serial_id AS "serialId",
           sdd.destination_warehouse_id AS "destinationWarehouseId"
         FROM sap_dispatch_line sdl
         JOIN sap_dispatch_doc sdd ON sdd.sap_dispatch_doc_id = sdl.sap_dispatch_doc_id
         JOIN grn g ON g.grn_id = $1
         WHERE sdl.serial_id = $2
           AND sdl.sap_dispatch_doc_id <> g.sap_dispatch_doc_id
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

    async findMissingExpectedLines(grnId) {
      const result = await pool.query(
        `SELECT
           sm.serial_id AS "serialId",
           sm.serial_no AS "serialNo"
         FROM grn g
         JOIN sap_dispatch_line sdl ON sdl.sap_dispatch_doc_id = g.sap_dispatch_doc_id
         JOIN serial_master sm ON sm.serial_id = sdl.serial_id
         LEFT JOIN grn_scan gs ON gs.grn_id = g.grn_id
          AND gs.serial_id = sdl.serial_id
          AND gs.match_status = 'MATCHED'
         WHERE g.grn_id = $1
           AND gs.grn_scan_id IS NULL`,
        [grnId]
      );

      return result.rows;
    },

    async markShort({ grnId, serialId, serialNo, createdBy }) {
      await this.insertScan({
        grnId,
        serialId,
        serialNo,
        matchStatus: "SHORT",
        scannedBy: createdBy,
        createdBy
      });
    }
  };
}
