export function createProductRepository(pool) {
  return {
    /* ── Products ── */
    async listProducts() {
      const result = await pool.query(`
        SELECT
          product_id AS "productId",
          product_code AS "productCode",
          name,
          segment,
          category,
          sub_category AS "subCategory",
          product_category AS "productCategory",
          distributor_price AS "distributorPrice",
          warranty,
          gst,
          mrp,
          base_price AS "basePrice",
          stock,
          sbu,
          poll,
          moq,
          description,
          is_battery AS "isBattery",
          is_active AS "isActive",
          created_at AS "createdAt"
        FROM product
        ORDER BY category, product_code
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
