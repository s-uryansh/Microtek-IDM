export function createWarehouseRepository(pool) {
  return {
    /* ── Warehouses ── */
    async listWarehouses() {
      const result = await pool.query(`
        SELECT
          w.warehouse_id AS "warehouseId",
          w.code,
          w.name,
          w.type,
          w.is_active AS "isActive",
          w.created_at AS "createdAt",
          COALESCE(s.unit_count, 0)::int AS "unitCount"
        FROM warehouse w
        LEFT JOIN (
          SELECT current_warehouse_id, COUNT(*) AS unit_count
          FROM serial_master
          WHERE current_status = 'IN_STOCK'
          GROUP BY current_warehouse_id
        ) s ON s.current_warehouse_id = w.warehouse_id
        ORDER BY w.code
      `);
      return result.rows;
    },

    async listWarehouseStock() {
      // Every individual product unit (serial) currently in stock, with its
      // product, the warehouse it physically sits in, and when it was received
      // into stock (set once at GRN/SRN/import receipt).
      const result = await pool.query(`
        SELECT
          sm.serial_id AS "serialId",
          sm.serial_no AS "serialNo",
          sm.current_status AS "serialStatus",
          sm.received_at AS "receivedAt",
          p.product_id AS "productId",
          p.product_code AS "productCode",
          p.name AS "productName",
          p.category,
          w.warehouse_id AS "warehouseId",
          w.code AS "warehouseCode",
          w.name AS "warehouseName"
        FROM serial_master sm
        JOIN product p ON p.product_id = sm.product_id
        JOIN warehouse w ON w.warehouse_id = sm.current_warehouse_id
        WHERE sm.current_status = 'IN_STOCK'
        ORDER BY w.code, p.product_code, sm.serial_no
      `);
      return result.rows;
    },

    async getWarehouseById(warehouseId) {
      const result = await pool.query(
        `
        SELECT
          warehouse_id AS "warehouseId",
          code,
          name,
          type,
          is_active AS "isActive"
        FROM warehouse
        WHERE warehouse_id = $1`,
        [warehouseId]
      );
      return result.rows[0] ?? null;
    },

    async createWarehouse({ code, name, type, createdBy }) {
      const result = await pool.query(
        `
        INSERT INTO warehouse (code, name, type, created_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name, updated_at = now(), updated_by = EXCLUDED.created_by
        RETURNING
          warehouse_id AS "warehouseId",
          code,
          name,
          type,
          is_active AS "isActive"`,
        [code, name, type, createdBy]
      );
      return result.rows[0];
    },

    async toggleWarehouseActive(warehouseId, isActive, updatedBy) {
      const result = await pool.query(
        `
        UPDATE warehouse
        SET is_active = $2, updated_at = now(), updated_by = $3
        WHERE warehouse_id = $1
        RETURNING
          warehouse_id AS "warehouseId",
          code,
          name,
          type,
          is_active AS "isActive"`,
        [warehouseId, isActive, updatedBy]
      );
      return result.rows[0] ?? null;
    },

    async getWarehouseByCode(code) {
      const result = await pool.query(
        `SELECT warehouse_id AS "warehouseId", code FROM warehouse WHERE code = $1`,
        [code]
      );
      return result.rows[0] ?? null;
    }
  };
}
