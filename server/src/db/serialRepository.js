export function createSerialRepository(pool) {
  function toNumber(value) {
    return value === null || value === undefined ? value : Number(value);
  }

  function mapSerial(row) {
    if (!row) return null;
    return {
      ...row,
      serialId: toNumber(row.serialId),
      productId: toNumber(row.productId),
      currentWarehouseId: toNumber(row.currentWarehouseId)
    };
  }

  return {
    async findProductByCode(productCode) {
      const result = await pool.query(
        `SELECT product_id AS "productId", product_code AS "productCode"
         FROM product
         WHERE product_code = $1 AND is_active = TRUE`,
        [productCode]
      );

      return result.rows[0] ?? null;
    },

    async insertProductionSerial({
      serialNo,
      productId,
      batchNo,
      currentWarehouseId,
      sourceInvoiceRef,
      batchId,
      createdBy
    }) {
      const result = await pool.query(
        `INSERT INTO serial_master (
           serial_no,
           product_id,
           batch_no,
           current_status,
           current_warehouse_id,
           source_invoice_ref,
           batch_id,
           created_by
         )
         VALUES ($1, $2, $3, 'PRODUCED', $4, $5, $6, $7)
         ON CONFLICT (serial_no) DO NOTHING
         RETURNING
           serial_id AS "serialId",
           serial_no AS "serialNo",
           current_warehouse_id AS "currentWarehouseId"`,
        [serialNo, productId, batchNo ?? null, currentWarehouseId ?? null, sourceInvoiceRef ?? null, batchId, createdBy]
      );

      if (result.rows[0]) {
        return result.rows[0];
      }

      const existing = await this.findBySerialNo(serialNo);
      return mapSerial(existing);
    },

    async appendSerialEvent({ serialId, eventType, warehouseId, referenceType, referenceId, batchId, createdBy }) {
      await pool.query(
        `INSERT INTO serial_event (
           serial_id,
           event_type,
           warehouse_id,
           reference_type,
           reference_id,
           batch_id,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [serialId, eventType, warehouseId ?? null, referenceType ?? null, referenceId ?? null, batchId ?? null, createdBy]
      );
    },

    async updateStatus(serialId, status, updatedBy) {
      await pool.query(
        `UPDATE serial_master
         SET current_status = $2,
             updated_at = now(),
             updated_by = $3
         WHERE serial_id = $1`,
        [serialId, status, updatedBy]
      );
    },

    async updateStatusIfCurrent(serialId, expectedStatus, status, updatedBy) {
      const result = await pool.query(
        `UPDATE serial_master
         SET current_status = $3,
             updated_at = now(),
             updated_by = $4
         WHERE serial_id = $1
           AND current_status = $2`,
        [serialId, expectedStatus, status, updatedBy]
      );

      return result.rowCount === 1;
    },

    async updateReceipt(serialId, warehouseId, receivedBy) {
      await pool.query(
        `UPDATE serial_master
         SET current_status = 'IN_STOCK',
             current_warehouse_id = $2,
             received_at = COALESCE(received_at, now()),
             updated_at = now(),
             updated_by = $3
         WHERE serial_id = $1`,
        [serialId, warehouseId, receivedBy]
      );
    },

    async findBySerialNo(serialNo) {
      const result = await pool.query(
        `SELECT
           serial_id AS "serialId",
           serial_no AS "serialNo",
           product_id AS "productId",
           current_status AS "currentStatus",
           current_warehouse_id AS "currentWarehouseId"
         FROM serial_master
         WHERE serial_no = $1`,
        [serialNo]
      );

      return mapSerial(result.rows[0]);
    }
  };
}
