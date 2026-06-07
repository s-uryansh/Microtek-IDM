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
    async findLineById(invoiceLineId) {
      const result = await pool.query(
        `SELECT
           il.invoice_line_id AS "invoiceLineId",
           il.invoice_id AS "invoiceId",
           il.product_id AS "productId",
           il.required_quantity AS "quantity",
           p.is_battery AS "isBattery",
           i.warehouse_id AS "warehouseId"
         FROM invoice_line il
         JOIN product p ON p.product_id = il.product_id
         JOIN invoice i ON i.invoice_id = il.invoice_id
         WHERE il.invoice_line_id = $1`,
        [invoiceLineId]
      );

      return result.rows[0] || null;
    },

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
