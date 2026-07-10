export function createSapDispatchDocRepository(pool) {
  return {
    /* ── Inbound stock (SAP dispatch documents) ── */
    async listDispatchDocs() {
      const result = await pool.query(`
        SELECT
          sdd.sap_dispatch_doc_id AS "sapDispatchDocId",
          sdd.external_ref AS "externalRef",
          sdd.status,
          sdd.created_at AS "createdAt",
          sdd.source_warehouse_id AS "sourceWarehouseId",
          sw.code AS "sourceWarehouseCode",
          sw.name AS "sourceWarehouseName",
          sdd.destination_warehouse_id AS "destinationWarehouseId",
          dw.code AS "destinationWarehouseCode",
          dw.name AS "destinationWarehouseName"
        FROM sap_dispatch_doc sdd
        JOIN warehouse dw ON dw.warehouse_id = sdd.destination_warehouse_id
        LEFT JOIN warehouse sw ON sw.warehouse_id = sdd.source_warehouse_id
        ORDER BY sdd.created_at DESC, sdd.sap_dispatch_doc_id DESC
      `);
      return result.rows.map((row) => ({
        ...row,
        sapDispatchDocId: Number(row.sapDispatchDocId),
        sourceWarehouseId: row.sourceWarehouseId === null ? null : Number(row.sourceWarehouseId),
        destinationWarehouseId: Number(row.destinationWarehouseId)
      }));
    },

    async dispatchDocLines(docIds) {
      if (!docIds.length) return [];
      const result = await pool.query(
        `
        SELECT
          sl.sap_dispatch_doc_id AS "sapDispatchDocId",
          sl.line_no AS "lineNo",
          sl.product_id AS "productId",
          p.product_code AS "productCode",
          p.name AS "productName",
          p.category,
          sm.serial_no AS "serialNo",
          sm.current_status AS "serialStatus"
        FROM sap_dispatch_line sl
        JOIN serial_master sm ON sm.serial_id = sl.serial_id
        JOIN product p ON p.product_id = sl.product_id
        WHERE sl.sap_dispatch_doc_id = ANY($1::bigint[])
        ORDER BY sl.sap_dispatch_doc_id, sl.line_no`,
        [docIds]
      );
      return result.rows.map((row) => ({
        ...row,
        sapDispatchDocId: Number(row.sapDispatchDocId)
      }));
    }
  };
}
