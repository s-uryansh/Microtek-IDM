export function createInvoiceRepository(pool) {
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

  return {
    async findById(invoiceId) {
      const result = await pool.query(
        `SELECT
           invoice_id AS "invoiceId",
           warehouse_id AS "warehouseId",
           status
         FROM invoice
         WHERE invoice_id = $1`,
        [invoiceId]
      );

      const invoice = result.rows[0];

      if (!invoice) {
        return null;
      }

      return {
        ...invoice,
        lines: await findLines(invoiceId)
      };
    },

    async updateStatus(invoiceId, status) {
      await pool.query(
        `UPDATE invoice
         SET status = $2,
             updated_at = now()
         WHERE invoice_id = $1`,
        [invoiceId, status]
      );
    }
  };
}
