export function createGrnRepository(pool) {
  return {
    async create({ receivingWarehouseId, sapDispatchDocId = null, createdBy }) {
      // sap_dispatch_doc_id is optional: a warehouse-scoped GRN leaves it NULL,
      // while a dispatch-doc-bound GRN (operator enters a dispatch number first)
      // links to that specific SAP dispatch document.
      const result = await pool.query(
        `INSERT INTO grn (receiving_warehouse_id, sap_dispatch_doc_id, created_by)
         VALUES ($1, $2, $3)
         RETURNING
           grn_id AS "grnId",
           sap_dispatch_doc_id AS "sapDispatchDocId",
           receiving_warehouse_id AS "receivingWarehouseId",
           status`,
        [receivingWarehouseId, sapDispatchDocId, createdBy]
      );

      return result.rows[0];
    },

    // Resolve a dispatch document by its number (external_ref). `warehouseIds`
    // scopes the lookup to the caller's warehouses; pass null/empty for admins
    // (all warehouses).
    async findDocByRef(externalRef, warehouseIds) {
      const scope = Array.isArray(warehouseIds) && warehouseIds.length ? warehouseIds : null;
      const result = await pool.query(
        `SELECT
           sap_dispatch_doc_id AS "sapDispatchDocId",
           external_ref AS "externalRef",
           source_warehouse_id AS "sourceWarehouseId",
           destination_warehouse_id AS "destinationWarehouseId",
           status
         FROM sap_dispatch_doc
         WHERE external_ref = $1
           AND ($2::bigint[] IS NULL OR destination_warehouse_id = ANY($2::bigint[]))
         LIMIT 1`,
        [externalRef, scope]
      );

      return result.rows[0] ?? null;
    },

    // Has this dispatch document already been received? A CLOSED/MATCHED GRN means
    // the stock was already taken in, so a new session must not start.
    async findCompletedByDoc(sapDispatchDocId) {
      const result = await pool.query(
        `SELECT
           grn_id AS "grnId",
           status
         FROM grn
         WHERE sap_dispatch_doc_id = $1
           AND status IN ('CLOSED', 'MATCHED')
         ORDER BY grn_id DESC
         LIMIT 1`,
        [sapDispatchDocId]
      );

      return result.rows[0] ?? null;
    },

    // Reuse an in-flight GRN for the same dispatch doc + warehouse rather than
    // opening a duplicate every time the operator re-enters the dispatch number.
    async findOpenByDoc(sapDispatchDocId, receivingWarehouseId) {
      const result = await pool.query(
        `SELECT
           grn_id AS "grnId",
           sap_dispatch_doc_id AS "sapDispatchDocId",
           receiving_warehouse_id AS "receivingWarehouseId",
           status
         FROM grn
         WHERE sap_dispatch_doc_id = $1
           AND receiving_warehouse_id = $2
           AND status NOT IN ('CLOSED', 'MATCHED')
         ORDER BY grn_id DESC
         LIMIT 1`,
        [sapDispatchDocId, receivingWarehouseId]
      );

      return result.rows[0] ?? null;
    },

    // Expected items for a dispatch doc, grouped by product + batch. Deliberately
    // returns NO serial numbers — the receiving operator sees product details and
    // quantities only.
    async expectedProducts(sapDispatchDocId) {
      const result = await pool.query(
        `SELECT
           p.product_id AS "productId",
           p.product_code AS "productCode",
           p.name AS "productName",
           p.category,
           p.segment,
           p.is_battery AS "isBattery",
           sm.batch_no AS "batchNo",
           COUNT(*)::int AS "expectedQty"
         FROM sap_dispatch_line sdl
         JOIN product p ON p.product_id = sdl.product_id
         JOIN serial_master sm ON sm.serial_id = sdl.serial_id
         WHERE sdl.sap_dispatch_doc_id = $1
         GROUP BY p.product_id, p.product_code, p.name, p.category, p.segment, p.is_battery, sm.batch_no
         ORDER BY p.name, sm.batch_no`,
        [sapDispatchDocId]
      );

      return result.rows;
    },

    // Received-so-far counts for this GRN, grouped the same way as expectedProducts
    // so the two can be merged for a per-product progress view.
    async receivedCountsByProduct(grnId) {
      const result = await pool.query(
        `SELECT
           sm.product_id AS "productId",
           sm.batch_no AS "batchNo",
           COUNT(*)::int AS "receivedQty"
         FROM grn_scan gs
         JOIN serial_master sm ON sm.serial_id = gs.serial_id
         WHERE gs.grn_id = $1 AND gs.match_status = 'MATCHED'
         GROUP BY sm.product_id, sm.batch_no`,
        [grnId]
      );

      return result.rows;
    },

    // Product-level membership: is this product part of the dispatch document?
    async isProductInDoc(sapDispatchDocId, productId) {
      const result = await pool.query(
        `SELECT 1
         FROM sap_dispatch_line
         WHERE sap_dispatch_doc_id = $1 AND product_id = $2
         LIMIT 1`,
        [sapDispatchDocId, productId]
      );

      return result.rows.length > 0;
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
