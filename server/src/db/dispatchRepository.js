export function createDispatchRepository(pool) {
  async function findLines(invoiceId) {
    const result = await pool.query(
      `SELECT
         invoice_line_id AS "invoiceLineId",
         product_id AS "productId",
         required_quantity AS "quantity"
       FROM invoice_line
       WHERE invoice_id = $1
       ORDER BY line_no`,
      [invoiceId]
    );

    return result.rows;
  }

  async function findScans(dispatchId) {
    const result = await pool.query(
      `SELECT
         dispatch_scan_id AS "dispatchScanId",
         invoice_line_id AS "invoiceLineId",
         serial_id AS "serialId"
       FROM dispatch_scan
       WHERE dispatch_id = $1`,
      [dispatchId]
    );

    return result.rows;
  }

  return {
    async createDispatch({ invoiceId, warehouseId, createdBy }) {
      const result = await pool.query(
        `INSERT INTO dispatch (
           invoice_id,
           warehouse_id,
           created_by
         )
         VALUES ($1, $2, $3)
         RETURNING
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           status`,
        [invoiceId, warehouseId, createdBy]
      );

      return result.rows[0];
    },

    async findById(dispatchId) {
      const result = await pool.query(
        `SELECT
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           status
         FROM dispatch
         WHERE dispatch_id = $1`,
        [dispatchId]
      );

      const dispatch = result.rows[0];

      if (!dispatch) {
        return null;
      }

      return {
        ...dispatch,
        lines: await findLines(dispatch.invoiceId),
        scans: await findScans(dispatchId)
      };
    },

    async lockById(dispatchId) {
      const result = await pool.query(
        `SELECT
           dispatch_id AS "dispatchId",
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
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

      return {
        ...dispatch,
        lines: await findLines(dispatch.invoiceId),
        scans: await findScans(dispatchId)
      };
    },

    async getWarehouseId(dispatchId) {
      const result = await pool.query("SELECT warehouse_id AS \"warehouseId\" FROM dispatch WHERE dispatch_id = $1", [
        dispatchId
      ]);

      return result.rows[0]?.warehouseId ?? null;
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
         ON CONFLICT (dispatch_id, serial_id) DO NOTHING
         RETURNING
           dispatch_scan_id AS "dispatchScanId"`,
        [dispatchId, invoiceLineId, serialId, scannedBy, createdBy]
      );

      return result.rows[0];
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
        "SELECT COUNT(*)::int AS count FROM dispatch_scan WHERE dispatch_id = $1",
        [dispatchId]
      );

      return result.rows[0].count;
    },

    async countScansForLine(dispatchId, invoiceLineId) {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM dispatch_scan
         WHERE dispatch_id = $1
           AND invoice_line_id = $2`,
        [dispatchId, invoiceLineId]
      );

      return result.rows[0].count;
    },

    async countScansForInvoice(invoiceId) {
      const result = await pool.query(
        `SELECT COUNT(ds.dispatch_scan_id)::int AS count
         FROM dispatch_scan ds
         JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
         WHERE d.invoice_id = $1`,
        [invoiceId]
      );

      return result.rows[0].count;
    }
  };
}
