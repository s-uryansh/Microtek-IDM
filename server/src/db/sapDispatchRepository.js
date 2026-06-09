export function createSapDispatchRepository(pool) {
  function toNumber(value) {
    return value === null || value === undefined ? value : Number(value);
  }

  function mapDispatch(row) {
    if (!row) return null;
    return {
      ...row,
      sapDispatchDocId: toNumber(row.sapDispatchDocId),
      sapDispatchLineId: toNumber(row.sapDispatchLineId),
      serialId: toNumber(row.serialId),
      productId: toNumber(row.productId),
      sourceWarehouseId: toNumber(row.sourceWarehouseId),
      destinationWarehouseId: toNumber(row.destinationWarehouseId)
    };
  }

  return {
    async upsertDoc({ externalRef, sourceWarehouseId, destinationWarehouseId, batchId, createdBy }) {
      const result = await pool.query(
        `INSERT INTO sap_dispatch_doc (
           external_ref,
           source_warehouse_id,
           destination_warehouse_id,
           batch_id,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (external_ref) DO UPDATE
         SET source_warehouse_id = COALESCE(EXCLUDED.source_warehouse_id, sap_dispatch_doc.source_warehouse_id),
             destination_warehouse_id = EXCLUDED.destination_warehouse_id,
             batch_id = COALESCE(EXCLUDED.batch_id, sap_dispatch_doc.batch_id),
             updated_at = now(),
             updated_by = EXCLUDED.created_by
         RETURNING
           sap_dispatch_doc_id AS "sapDispatchDocId",
           external_ref AS "externalRef",
           source_warehouse_id AS "sourceWarehouseId",
           destination_warehouse_id AS "destinationWarehouseId"`,
        [externalRef, sourceWarehouseId ?? null, destinationWarehouseId, batchId ?? null, createdBy]
      );

      return mapDispatch(result.rows[0]);
    },

    async insertLine({ sapDispatchDocId, serialId, productId, lineNo, createdBy }) {
      const result = await pool.query(
        `INSERT INTO sap_dispatch_line (
           sap_dispatch_doc_id,
           serial_id,
           product_id,
           line_no,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (sap_dispatch_doc_id, serial_id) DO NOTHING
         RETURNING
           sap_dispatch_line_id AS "sapDispatchLineId",
           sap_dispatch_doc_id AS "sapDispatchDocId",
           serial_id AS "serialId",
           product_id AS "productId",
           line_no AS "lineNo"`,
        [sapDispatchDocId, serialId, productId, lineNo, createdBy]
      );

      return mapDispatch(result.rows[0]);
    },

    async findBySerialId(serialId) {
      const result = await pool.query(
        `SELECT
           sdd.sap_dispatch_doc_id AS "sapDispatchDocId",
           sdl.sap_dispatch_line_id AS "sapDispatchLineId",
           sdd.external_ref AS "externalRef",
           sdl.serial_id AS "serialId",
           sdl.product_id AS "productId",
           sdd.source_warehouse_id AS "sourceWarehouseId",
           sdd.destination_warehouse_id AS "destinationWarehouseId"
         FROM sap_dispatch_line sdl
         JOIN sap_dispatch_doc sdd ON sdd.sap_dispatch_doc_id = sdl.sap_dispatch_doc_id
         WHERE sdl.serial_id = $1
         ORDER BY sdd.created_at DESC, sdd.sap_dispatch_doc_id DESC`,
        [serialId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      // A serial mapping to more than one dispatch doc is ambiguous: there is no
      // agreed policy for which doc "owns" it, so rather than silently picking
      // the newest we surface the ambiguity. `ambiguous` + `candidateDispatchDocIds`
      // let the caller raise/return a distinct condition. NOTE: how to RESOLVE
      // the ambiguity (latest? source-warehouse match? reject?) is an open
      // design decision — see SCRATCH_receipt_vs_grn_scan.txt / sign-off item B.
      const candidates = result.rows.map(mapDispatch);
      const [newest] = candidates;

      return {
        ...newest,
        ambiguous: candidates.length > 1,
        candidateDispatchDocIds: candidates.map((c) => c.sapDispatchDocId)
      };
    }
  };
}
