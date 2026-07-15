export function createSerialRepository(pool) {
  function toNumber(value) {
    return value === null || value === undefined ? value : Number(value);
  }

  function mapSerial(row) {
    if (!row) return null;
    const mapped = {
      ...row,
      serialId: toNumber(row.serialId),
      productId: toNumber(row.productId),
      currentWarehouseId: toNumber(row.currentWarehouseId)
    };
    if (row.sourceWarehouseId !== undefined) mapped.sourceWarehouseId = toNumber(row.sourceWarehouseId);
    if (row.destinationWarehouseId !== undefined) mapped.destinationWarehouseId = toNumber(row.destinationWarehouseId);
    return mapped;
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

    // Resolve a warehouse by a human-friendly reference: its code ("RW-01") or
    // full name, case-insensitively, or a numeric warehouse_id (kept for the SAP
    // JSON/QR path that still sends ids). Returns null when nothing matches so
    // callers can reject the row as UNKNOWN_WAREHOUSE.
    async findWarehouseByRef(ref) {
      if (ref === undefined || ref === null || String(ref).trim() === "") {
        return null;
      }
      const value = String(ref).trim();
      const result = await pool.query(
        `SELECT warehouse_id AS "warehouseId", code, name
         FROM warehouse
         WHERE is_active = TRUE
           AND (LOWER(code) = LOWER($1) OR LOWER(name) = LOWER($1) OR CAST(warehouse_id AS text) = $1)
         ORDER BY warehouse_id
         LIMIT 1`,
        [value]
      );

      const row = result.rows[0];
      if (!row) return null;
      return { ...row, warehouseId: toNumber(row.warehouseId) };
    },

    async insertProductionSerial({
      serialNo,
      productId,
      batchNo,
      currentWarehouseId,
      sourceWarehouseId,
      destinationWarehouseId,
      qrPayload,
      currentStatus,
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
           original_dispatch_warehouse_id,
           destination_warehouse_id,
           qr_payload,
           source_invoice_ref,
           batch_id,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (serial_no) DO NOTHING
         RETURNING
           serial_id AS "serialId",
           serial_no AS "serialNo",
           current_warehouse_id AS "currentWarehouseId",
           original_dispatch_warehouse_id AS "sourceWarehouseId",
           destination_warehouse_id AS "destinationWarehouseId"`,
        [
          serialNo,
          productId,
          batchNo ?? null,
          currentStatus ?? "PRODUCED",
          currentWarehouseId ?? null,
          sourceWarehouseId ?? null,
          destinationWarehouseId ?? null,
          qrPayload ?? null,
          sourceInvoiceRef ?? null,
          batchId,
          createdBy
        ]
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

    async countAvailableStock({ warehouseId, productIds }) {
      if (!Array.isArray(productIds) || productIds.length === 0) {
        return 0;
      }

      // Only freely-dispatchable stock counts: a serial returned as DEFECTIVE or
      // REPAIR sits IN_STOCK but is on condition hold until it is retagged
      // SALEABLE, so it must not be counted as available.
      const result = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM serial_master
         WHERE current_status = 'IN_STOCK'
           AND current_warehouse_id = $1
           AND product_id = ANY($2::bigint[])
           AND (condition_tag IS NULL OR condition_tag = 'SALEABLE')`,
        [warehouseId, productIds]
      );

      return result.rows[0].count;
    },

    async setConditionTag(serialId, conditionTag, updatedBy) {
      await pool.query(
        `UPDATE serial_master
         SET condition_tag = $2,
             updated_at = now(),
             updated_by = $3
         WHERE serial_id = $1`,
        [serialId, conditionTag, updatedBy]
      );
    },

    async findHeldStock({ warehouseIds } = {}) {
      // Serials on condition hold (DEFECTIVE/REPAIR) that are physically in stock,
      // optionally scoped to the caller's warehouses, for the retag screen.
      const conditions = ["sm.current_status = 'IN_STOCK'", "sm.condition_tag IN ('DEFECTIVE', 'REPAIR')"];
      const params = [];

      if (Array.isArray(warehouseIds) && warehouseIds.length > 0) {
        params.push(warehouseIds);
        conditions.push(`sm.current_warehouse_id = ANY($${params.length}::bigint[])`);
      }

      const result = await pool.query(
        `SELECT
           sm.serial_id AS "serialId",
           sm.serial_no AS "serialNo",
           sm.product_id AS "productId",
           p.product_code AS "productCode",
           p.category,
           sm.condition_tag AS "conditionTag",
           sm.current_warehouse_id AS "warehouseId"
         FROM serial_master sm
         JOIN product p ON p.product_id = sm.product_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY sm.serial_no`,
        params
      );

      return result.rows.map((row) => ({
        ...row,
        serialId: toNumber(row.serialId),
        productId: toNumber(row.productId),
        warehouseId: toNumber(row.warehouseId)
      }));
    },

    async findBySerialNo(serialNo) {
      const result = await pool.query(
        `SELECT
           serial_id AS "serialId",
           serial_no AS "serialNo",
           product_id AS "productId",
           current_status AS "currentStatus",
           current_warehouse_id AS "currentWarehouseId",
           condition_tag AS "conditionTag",
           original_dispatch_warehouse_id AS "sourceWarehouseId",
           destination_warehouse_id AS "destinationWarehouseId"
         FROM serial_master
         WHERE serial_no = $1`,
        [serialNo]
      );

      return mapSerial(result.rows[0]);
    }
  };
}
