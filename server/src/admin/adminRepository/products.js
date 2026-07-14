export function createProductRepository(pool) {
  return {
    /* ── Products ── */
    async listProducts() {
      const result = await pool.query(`
        SELECT
          p.product_id AS "productId",
          p.product_code AS "productCode",
          p.name,
          p.segment,
          p.category,
          p.sub_category AS "subCategory",
          p.product_category AS "productCategory",
          p.distributor_price AS "distributorPrice",
          p.warranty,
          p.gst,
          p.mrp,
          p.base_price AS "basePrice",
          p.stock,
          p.sbu,
          p.poll,
          p.moq,
          p.description,
          p.is_battery AS "isBattery",
          p.is_active AS "isActive",
          p.created_at AS "createdAt",
          COALESCE(s.serial_numbers, ARRAY[]::text[]) AS "serialNumbers"
        FROM product p
        LEFT JOIN (
          SELECT product_id, array_agg(serial_no ORDER BY serial_no) AS serial_numbers
          FROM serial_master
          GROUP BY product_id
        ) s ON s.product_id = p.product_id
        ORDER BY p.category, p.product_code
      `);
      return result.rows;
    },

    async upsertProduct({
      productCode, name, segment, category, subCategory, productCategory,
      distributorPrice, warranty, gst, mrp, basePrice, stock, sbu, poll, moq, description,
      isBattery, createdBy
    }) {
      const result = await pool.query(
        `
        INSERT INTO product (
          product_code, name, segment, category, sub_category, product_category,
          distributor_price, warranty, gst, mrp, base_price, stock, sbu, poll, moq, description,
          is_battery, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (product_code) DO UPDATE
        SET name = EXCLUDED.name, segment = EXCLUDED.segment,
            category = EXCLUDED.category, sub_category = EXCLUDED.sub_category,
            product_category = EXCLUDED.product_category,
            distributor_price = EXCLUDED.distributor_price, warranty = EXCLUDED.warranty,
            gst = EXCLUDED.gst, mrp = EXCLUDED.mrp, base_price = EXCLUDED.base_price,
            stock = EXCLUDED.stock, sbu = EXCLUDED.sbu, poll = EXCLUDED.poll,
            moq = EXCLUDED.moq, description = EXCLUDED.description,
            is_battery = EXCLUDED.is_battery,
            updated_at = now(), updated_by = EXCLUDED.created_by
        RETURNING product_id AS "productId", product_code AS "productCode", name`,
        [
          productCode, name, segment, category, subCategory, productCategory,
          distributorPrice, warranty, gst, mrp, basePrice, stock, sbu, poll, moq, description,
          isBattery, createdBy
        ]
      );
      return result.rows[0];
    },

    async getProductByCode(productCode) {
      const result = await pool.query(
        `SELECT product_id AS "productId", product_code AS "productCode" FROM product WHERE product_code = $1`,
        [productCode]
      );
      return result.rows[0] ?? null;
    }
  };
}
