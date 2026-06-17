export function createBatteryPreBillingRepository(pool) {
  return {
    async insertCommit({ invoiceLineId, serialId, committedBy, createdBy }) {
      const result = await pool.query(
        `INSERT INTO battery_pre_billing (invoice_line_id, serial_id, committed_by, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING battery_pre_billing_id AS "batteryPreBillingId"`,
        [invoiceLineId, serialId, committedBy, createdBy ?? committedBy]
      );

      return result.rows[0];
    },

    async findBatteryLine(invoiceId, productId) {
      // Resolve the battery invoice line a scanned serial belongs to, by its
      // product — so the operator never has to pick a line by hand.
      const result = await pool.query(
        `SELECT il.invoice_line_id AS "invoiceLineId",
                il.product_id AS "productId",
                il.required_quantity AS "requiredQuantity"
         FROM invoice_line il
         JOIN product p ON p.product_id = il.product_id
         WHERE il.invoice_id = $1
           AND il.product_id = $2
           AND p.is_battery = TRUE
         ORDER BY il.line_no
         LIMIT 1`,
        [invoiceId, productId]
      );

      return result.rows[0] || null;
    },

    async countCommitsForLine(invoiceLineId) {
      const result = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM battery_pre_billing WHERE invoice_line_id = $1",
        [invoiceLineId]
      );

      return result.rows[0].cnt;
    },

    async findCommitBySerial(serialId) {
      const result = await pool.query(
        `SELECT
           battery_pre_billing_id AS "batteryPreBillingId",
           invoice_line_id AS "invoiceLineId",
           serial_id AS "serialId",
           committed_at AS "committedAt",
           committed_by AS "committedBy"
         FROM battery_pre_billing
         WHERE serial_id = $1`,
        [serialId]
      );

      return result.rows[0] || null;
    },

    async findCommitForInvoice(serialId, invoiceId) {
      // A commit only counts for the invoice it was actually pre-billed against.
      // Used by the dispatch gate so a battery pre-billed to invoice B cannot be
      // dispatched on invoice A.
      const result = await pool.query(
        `SELECT
           bpb.battery_pre_billing_id AS "batteryPreBillingId",
           bpb.invoice_line_id AS "invoiceLineId",
           bpb.serial_id AS "serialId"
         FROM battery_pre_billing bpb
         JOIN invoice_line il ON il.invoice_line_id = bpb.invoice_line_id
         WHERE bpb.serial_id = $1
           AND il.invoice_id = $2`,
        [serialId, invoiceId]
      );

      return result.rows[0] || null;
    },

    async countCommitsForInvoice(invoiceId) {
      const result = await pool.query(
        `SELECT COUNT(*)::int AS cnt
         FROM battery_pre_billing bpb
         JOIN invoice_line il ON il.invoice_line_id = bpb.invoice_line_id
         WHERE il.invoice_id = $1`,
        [invoiceId]
      );

      return result.rows[0].cnt;
    }
  };
}
