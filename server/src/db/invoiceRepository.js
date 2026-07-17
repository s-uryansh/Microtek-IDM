export function createInvoiceRepository(pool) {
  function toNumber(value) {
    return value === null || value === undefined ? value : Number(value);
  }

  function mapLine(row) {
    if (!row) return null;
    const mapped = {
      ...row,
      invoiceLineId: toNumber(row.invoiceLineId),
      productId: toNumber(row.productId),
      quantity: toNumber(row.quantity)
    };

    if (row.invoiceId !== undefined) mapped.invoiceId = toNumber(row.invoiceId);

    return mapped;
  }

  function mapInvoice(row, lines = []) {
    if (!row) return null;
    return {
      ...row,
      invoiceId: toNumber(row.invoiceId),
      sourceWarehouseId: toNumber(row.sourceWarehouseId),
      destinationWarehouseId: toNumber(row.destinationWarehouseId),
      lines
    };
  }

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

    return result.rows.map(mapLine);
  }

  return {
    async findLineById(invoiceLineId) {
      const result = await pool.query(
        `SELECT
           il.invoice_line_id AS "invoiceLineId",
           il.invoice_id AS "invoiceId",
           il.product_id AS "productId",
           il.required_quantity AS "quantity",
           p.is_battery AS "isBattery"
         FROM invoice_line il
         JOIN product p ON p.product_id = il.product_id
         WHERE il.invoice_line_id = $1`,
        [invoiceLineId]
      );

      return mapLine(result.rows[0]);
    },

    async findById(invoiceId) {
      const result = await pool.query(
        `SELECT
           invoice_id AS "invoiceId",
           status,
           invoice_type AS "invoiceType",
           source_warehouse_id AS "sourceWarehouseId",
           destination_warehouse_id AS "destinationWarehouseId"
         FROM invoice
         WHERE invoice_id = $1`,
        [invoiceId]
      );

      const invoice = result.rows[0];

      if (!invoice) {
        return null;
      }

      return mapInvoice(invoice, await findLines(invoiceId));
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
