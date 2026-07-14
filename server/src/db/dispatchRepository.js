export function createDispatchRepository(pool) {
  function toNumber(value) {
    return value === null || value === undefined ? value : Number(value);
  }

  function mapLine(row) {
    if (!row) return null;
    return {
      ...row,
      invoiceLineId: toNumber(row.invoiceLineId),
      productId: toNumber(row.productId),
      quantity: toNumber(row.quantity),
      targetQuantity: toNumber(row.targetQuantity)
    };
  }

  function mapScan(row) {
    if (!row) return null;
    return {
      ...row,
      dispatchScanId: toNumber(row.dispatchScanId),
      invoiceLineId: toNumber(row.invoiceLineId),
      serialId: toNumber(row.serialId)
    };
  }

  function mapDispatch(row, { lines, scans } = {}) {
    if (!row) return null;
    const mapped = {
      ...row,
      dispatchId: toNumber(row.dispatchId),
      invoiceId: toNumber(row.invoiceId),
      warehouseId: toNumber(row.warehouseId),
      targetQuantity: toNumber(row.targetQuantity)
    };

    if (lines) mapped.lines = lines;
    if (scans) mapped.scans = scans;

    return mapped;
  }

  async function findLines(invoiceId, dispatchId = null) {
    // dispatch_line.target_quantity (when present) is the per-line cap chosen by the
    // operator for this dispatch. When absent, the line cap falls back to the full
    // invoice line quantity (legacy single-quantity dispatches).
    const result = await pool.query(
      `SELECT
         il.invoice_line_id AS "invoiceLineId",
         il.product_id AS "productId",
         il.required_quantity AS "quantity",
         p.is_battery AS "isBattery",
         dl.target_quantity AS "targetQuantity"
       FROM invoice_line il
       JOIN product p ON p.product_id = il.product_id
       LEFT JOIN dispatch_line dl
         ON dl.invoice_line_id = il.invoice_line_id
        AND dl.dispatch_id = $2
       WHERE il.invoice_id = $1
       ORDER BY il.line_no`,
      [invoiceId, dispatchId]
    );

    return result.rows.map(mapLine);
  }

  async function findScans(dispatchId) {
    const result = await pool.query(
      `SELECT
         dispatch_scan_id AS "dispatchScanId",
         invoice_line_id AS "invoiceLineId",
         serial_id AS "serialId"
       FROM dispatch_scan
       WHERE dispatch_id = $1
         AND returned_at IS NULL`,
      [dispatchId]
    );

    return result.rows.map(mapScan);
  }

  return {
    async createDispatch({ invoiceId, warehouseId, targetQuantity, createdBy }) {
      const result = await pool.query(
        `INSERT INTO dispatch (
           invoice_id,
           warehouse_id,
           target_quantity,
           created_by
         )
         VALUES ($1, $2, $3, $4)
         RETURNING
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           target_quantity AS "targetQuantity",
           status`,
        [invoiceId, warehouseId, targetQuantity ?? null, createdBy]
      );

      return mapDispatch(result.rows[0]);
    },

    async findByInvoiceId(invoiceId) {
      const result = await pool.query(
        `SELECT
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           target_quantity AS "targetQuantity",
           status
         FROM dispatch
         WHERE invoice_id = $1`,
        [invoiceId]
      );

      return mapDispatch(result.rows[0]);
    },

    async findById(dispatchId) {
      const result = await pool.query(
        `SELECT
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           target_quantity AS "targetQuantity",
           status
         FROM dispatch
         WHERE dispatch_id = $1`,
        [dispatchId]
      );

      const dispatch = result.rows[0];

      if (!dispatch) {
        return null;
      }

      return mapDispatch(dispatch, {
        lines: await findLines(dispatch.invoiceId, dispatchId),
        scans: await findScans(dispatchId)
      });
    },

    async lockById(dispatchId) {
      const result = await pool.query(
        `SELECT
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           target_quantity AS "targetQuantity",
           status
         FROM dispatch
         WHERE dispatch_id = $1
         FOR UPDATE`,
        [dispatchId]
      );

      const dispatch = result.rows[0];

      if (!dispatch) {
        return null;
      }

      return mapDispatch(dispatch, {
        lines: await findLines(dispatch.invoiceId, dispatchId),
        scans: await findScans(dispatchId)
      });
    },

    async setDispatchLineTargets(dispatchId, lineTargets, createdBy) {
      // Replace per-line targets for this dispatch with the supplied selection.
      await pool.query(`DELETE FROM dispatch_line WHERE dispatch_id = $1`, [dispatchId]);

      for (const { invoiceLineId, targetQuantity } of lineTargets) {
        if (!Number.isInteger(targetQuantity) || targetQuantity <= 0) {
          continue;
        }
        await pool.query(
          `INSERT INTO dispatch_line (dispatch_id, invoice_line_id, target_quantity, created_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (dispatch_id, invoice_line_id) DO UPDATE
           SET target_quantity = EXCLUDED.target_quantity,
               updated_at = now(),
               updated_by = EXCLUDED.created_by`,
          [dispatchId, invoiceLineId, targetQuantity, createdBy]
        );
      }
    },

    async getWarehouseId(dispatchId) {
      const result = await pool.query("SELECT warehouse_id AS \"warehouseId\" FROM dispatch WHERE dispatch_id = $1", [
        dispatchId
      ]);

      return toNumber(result.rows[0]?.warehouseId);
    },

    async setDispatchTargetQuantity(dispatchId, targetQuantity, updatedBy) {
      const result = await pool.query(
        `UPDATE dispatch
         SET target_quantity = $2,
             updated_at = now(),
             updated_by = $3
         WHERE dispatch_id = $1
         RETURNING
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           target_quantity AS "targetQuantity",
           status`,
        [dispatchId, targetQuantity, updatedBy]
      );

      return mapDispatch(result.rows[0]);
    },

    async updateWarehouse(dispatchId, warehouseId, updatedBy) {
      const result = await pool.query(
        `UPDATE dispatch
         SET warehouse_id = $2,
             updated_at = now(),
             updated_by = $3
         WHERE dispatch_id = $1
         RETURNING
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           target_quantity AS "targetQuantity",
           status`,
        [dispatchId, warehouseId, updatedBy]
      );

      return mapDispatch(result.rows[0]);
    },

    async insertScan({ dispatchId, invoiceLineId, serialId, scannedBy, createdBy }) {
      const result = await pool.query(
        `INSERT INTO dispatch_scan (
           dispatch_id,
           invoice_line_id,
           serial_id,
           scanned_by,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (dispatch_id, serial_id) WHERE returned_at IS NULL DO NOTHING
         RETURNING
           dispatch_scan_id AS "dispatchScanId"`,
        [dispatchId, invoiceLineId, serialId, scannedBy, createdBy]
      );

      return result.rows[0] ? { dispatchScanId: toNumber(result.rows[0].dispatchScanId) } : undefined;
    },

    async markScanReturned(dispatchScanId, returnedBy) {
      // Soft-return the dispatch scan so it stops counting toward the dispatched
      // quantity (re-opening the invoice) while preserving the row for audit.
      const result = await pool.query(
        `UPDATE dispatch_scan
         SET returned_at = now(),
             returned_by = $2
         WHERE dispatch_scan_id = $1
           AND returned_at IS NULL`,
        [dispatchScanId, returnedBy]
      );

      return result.rowCount === 1;
    },

    async updateStatus(dispatchId, status) {
      await pool.query(
        `UPDATE dispatch
         SET status = $2,
             completed_at = CASE WHEN $2::varchar = 'DISPATCHED' THEN now() ELSE completed_at END,
             updated_at = now()
         WHERE dispatch_id = $1`,
        [dispatchId, status]
      );
    },

    async countScans(dispatchId) {
      const result = await pool.query(
        "SELECT COUNT(*)::int AS count FROM dispatch_scan WHERE dispatch_id = $1 AND returned_at IS NULL",
        [dispatchId]
      );

      return result.rows[0].count;
    },

    async countScansForLine(dispatchId, invoiceLineId) {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM dispatch_scan
         WHERE dispatch_id = $1
           AND invoice_line_id = $2
           AND returned_at IS NULL`,
        [dispatchId, invoiceLineId]
      );

      return result.rows[0].count;
    },

    async countScansForInvoice(invoiceId) {
      const result = await pool.query(
        `SELECT COUNT(ds.dispatch_scan_id)::int AS count
         FROM dispatch_scan ds
         JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
         WHERE d.invoice_id = $1
           AND ds.returned_at IS NULL`,
        [invoiceId]
      );

      return result.rows[0].count;
    },

    async findConfirmedSerials(dispatchId) {
      const dispatchResult = await pool.query(
        `SELECT
           d.dispatch_id AS "dispatchId",
           d.invoice_id AS "invoiceId",
           d.completed_at AS "completedAt",
           d.status
         FROM dispatch d
         WHERE d.dispatch_id = $1`,
        [dispatchId]
      );

      return mapDispatch(dispatchResult.rows[0]);
    },

    async findSerialsForDispatch(dispatchId) {
      const result = await pool.query(
        `SELECT
           s.serial_no AS "serialNo",
           p.product_code AS "productCode",
           d.warehouse_id AS "warehouseId"
         FROM dispatch_scan ds
         JOIN serial_master s ON s.serial_id = ds.serial_id
         JOIN product p ON p.product_id = s.product_id
         JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
         WHERE ds.dispatch_id = $1
         ORDER BY s.serial_no`,
        [dispatchId]
      );

      return result.rows;
    },

    async findPendingSapSyncDispatches(limit = 100) {
      const result = await pool.query(
        `SELECT
           d.dispatch_id AS "dispatchId",
           d.invoice_id AS "invoiceId",
           d.completed_at AS "completedAt",
           d.status
         FROM dispatch d
         WHERE d.status = 'DISPATCHED'
           AND d.sap_outbound_batch_id IS NULL
         ORDER BY d.completed_at ASC NULLS LAST
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    },

    async markSapSynced(dispatchId, sapBatchId) {
      const result = await pool.query(
        `UPDATE dispatch
         SET sap_outbound_batch_id = COALESCE($2, sap_outbound_batch_id),
             updated_at = now()
         WHERE dispatch_id = $1
         RETURNING
           dispatch_id AS "dispatchId",
           sap_outbound_batch_id AS "sapOutboundBatchId"`,
        [dispatchId, sapBatchId]
      );

      return result.rows[0] ?? null;
    }
  };
}
