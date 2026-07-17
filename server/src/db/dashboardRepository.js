export function createDashboardRepository(pool) {
  async function run(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
  }

  async function run1(sql, params = []) {
    return (await run(sql, params))[0];
  }

  // warehouseIds = null means all warehouses (admin). category/subCategory/
  // productCategory = null means no filter on that level.
  async function countSerialsByStatus({ warehouseIds, category = null, subCategory = null, productCategory = null }) {
    return run(
      `SELECT sm.current_status AS "status", COUNT(*)::int AS "count"
       FROM serial_master sm
       LEFT JOIN product p ON p.product_id = sm.product_id
       WHERE ($1::bigint[] IS NULL OR sm.current_warehouse_id = ANY($1::bigint[]))
         AND ($2::text IS NULL OR p.category = $2)
         AND ($3::text IS NULL OR p.sub_category = $3)
         AND ($4::text IS NULL OR p.product_category = $4)
       GROUP BY sm.current_status
       ORDER BY COUNT(*) DESC`,
      [warehouseIds, category, subCategory, productCategory]
    );
  }

  async function countExceptionsByStatus({ warehouseIds }) {
    return run(
      `SELECT status, COUNT(*)::int AS "count"
       FROM exception_log
       WHERE ($1::bigint[] IS NULL OR warehouse_id = ANY($1::bigint[]))
       GROUP BY status`,
      [warehouseIds]
    );
  }

  async function countExceptionsByRule({ warehouseIds, limit = 8 }) {
    return run(
      `SELECT rule_code AS "ruleCode", COUNT(*)::int AS "count"
       FROM exception_log
       WHERE status = 'OPEN'
         AND ($1::bigint[] IS NULL OR warehouse_id = ANY($1::bigint[]))
       GROUP BY rule_code
       ORDER BY COUNT(*) DESC
       LIMIT $2`,
      [warehouseIds, limit]
    );
  }

  async function countGrnsInProgress({ warehouseIds }) {
    const row = await run1(
      `SELECT COUNT(*)::int AS "count"
       FROM grn
       WHERE status NOT IN ('MATCHED','EXCEPTION','CLOSED')
         AND ($1::bigint[] IS NULL OR receiving_warehouse_id = ANY($1::bigint[]))`,
      [warehouseIds]
    );
    return row?.count ?? 0;
  }

  async function countDispatchesInProgress({ warehouseIds }) {
    const row = await run1(
      `SELECT COUNT(*)::int AS "count"
       FROM dispatch
       WHERE status <> 'DISPATCHED'
         AND ($1::bigint[] IS NULL OR warehouse_id = ANY($1::bigint[]))`,
      [warehouseIds]
    );
    return row?.count ?? 0;
  }

  async function findRecentGrns({ warehouseIds, limit = 5 }) {
    return run(
      `SELECT g.grn_id AS "grnId", g.receiving_warehouse_id AS "warehouseId",
              w.code AS "warehouseCode", g.status,
              g.created_at AS "createdAt", g.completed_at AS "completedAt"
       FROM grn g
       LEFT JOIN warehouse w ON w.warehouse_id = g.receiving_warehouse_id
       WHERE ($1::bigint[] IS NULL OR g.receiving_warehouse_id = ANY($1::bigint[]))
       ORDER BY g.created_at DESC
       LIMIT $2`,
      [warehouseIds, limit]
    );
  }

  async function findRecentDispatches({ warehouseIds, limit = 5 }) {
    return run(
      `SELECT d.dispatch_id AS "dispatchId", d.invoice_id AS "invoiceId",
              d.warehouse_id AS "warehouseId", w.code AS "warehouseCode",
              d.status, d.created_at AS "createdAt", d.completed_at AS "completedAt"
       FROM dispatch d
       LEFT JOIN warehouse w ON w.warehouse_id = d.warehouse_id
       WHERE ($1::bigint[] IS NULL OR d.warehouse_id = ANY($1::bigint[]))
       ORDER BY d.created_at DESC
       LIMIT $2`,
      [warehouseIds, limit]
    );
  }

  async function countInStockByWarehouse({ warehouseIds, category = null, subCategory = null, productCategory = null }) {
    return run(
      `SELECT sm.current_warehouse_id AS "warehouseId",
              w.code AS "warehouseCode",
              COUNT(*)::int AS "count"
       FROM serial_master sm
       LEFT JOIN warehouse w ON w.warehouse_id = sm.current_warehouse_id
       LEFT JOIN product p ON p.product_id = sm.product_id
       WHERE sm.current_status = 'IN_STOCK'
         AND ($1::bigint[] IS NULL OR sm.current_warehouse_id = ANY($1::bigint[]))
         AND ($2::text IS NULL OR p.category = $2)
         AND ($3::text IS NULL OR p.sub_category = $3)
         AND ($4::text IS NULL OR p.product_category = $4)
       GROUP BY sm.current_warehouse_id, w.code
       ORDER BY COUNT(*) DESC`,
      [warehouseIds, category, subCategory, productCategory]
    );
  }

  async function ageingBuckets({ warehouseIds, category = null, subCategory = null, productCategory = null }) {
    return run(
      `SELECT
         CASE
           WHEN EXTRACT(DAY FROM (now() - sm.received_at)) <= 30 THEN '0-30'
           WHEN EXTRACT(DAY FROM (now() - sm.received_at)) <= 60 THEN '31-60'
           WHEN EXTRACT(DAY FROM (now() - sm.received_at)) <= 90 THEN '61-90'
           ELSE '91+'
         END AS "label",
         COUNT(*)::int AS "value",
         COALESCE(SUM(p.mrp), 0)::float AS "price"
       FROM serial_master sm
       LEFT JOIN product p ON p.product_id = sm.product_id
       WHERE sm.current_status = 'IN_STOCK'
         AND sm.received_at IS NOT NULL
         AND ($1::bigint[] IS NULL OR sm.current_warehouse_id = ANY($1::bigint[]))
         AND ($2::text IS NULL OR p.category = $2)
         AND ($3::text IS NULL OR p.sub_category = $3)
         AND ($4::text IS NULL OR p.product_category = $4)
       GROUP BY 1
       ORDER BY MIN(sm.received_at)`,
      [warehouseIds, category, subCategory, productCategory]
    );
  }

  // Base serials that are physically held in stock under two or more distinct
  // products (e.g. an inverter and a controller both stamped "SKU-100E"). This
  // is legitimate under the composed-serial model (V027) but operationally risky
  // — an operator scanning the raw base gets an AMBIGUOUS_SERIAL — so admins get
  // an alert listing each collision and the products/warehouses involved.
  async function findDuplicateBaseSerials({ warehouseIds, limit = 50 }) {
    return run(
      `WITH held AS (
         SELECT sm.base_serial,
                sm.product_id,
                sm.serial_no,
                sm.current_warehouse_id,
                p.product_code,
                p.name AS product_name,
                w.code AS warehouse_code
         FROM serial_master sm
         LEFT JOIN product p ON p.product_id = sm.product_id
         LEFT JOIN warehouse w ON w.warehouse_id = sm.current_warehouse_id
         WHERE sm.current_status = 'IN_STOCK'
           AND sm.base_serial IS NOT NULL
           AND sm.base_serial <> ''
           AND ($1::bigint[] IS NULL OR sm.current_warehouse_id = ANY($1::bigint[]))
       ),
       dup AS (
         SELECT base_serial
         FROM held
         GROUP BY base_serial
         HAVING COUNT(DISTINCT product_id) > 1
       )
       SELECT h.base_serial AS "baseSerial",
              json_agg(
                json_build_object(
                  'productId', h.product_id,
                  'productCode', h.product_code,
                  'productName', h.product_name,
                  'serialNo', h.serial_no,
                  'warehouseId', h.current_warehouse_id,
                  'warehouseCode', h.warehouse_code
                )
                ORDER BY h.product_code, h.serial_no
              ) AS "items"
       FROM held h
       JOIN dup ON dup.base_serial = h.base_serial
       GROUP BY h.base_serial
       ORDER BY h.base_serial
       LIMIT $2`,
      [warehouseIds, limit]
    );
  }

  // Distinct category / sub category / product category tuples, for the
  // dashboard's cascading filter dropdowns.
  async function listCategories() {
    return run(
      `SELECT DISTINCT category, sub_category AS "subCategory", product_category AS "productCategory"
       FROM product
       WHERE category IS NOT NULL
       ORDER BY category, sub_category, product_category`
    );
  }

  return {
    countSerialsByStatus,
    countExceptionsByStatus,
    countExceptionsByRule,
    countGrnsInProgress,
    countDispatchesInProgress,
    findRecentGrns,
    findRecentDispatches,
    countInStockByWarehouse,
    ageingBuckets,
    findDuplicateBaseSerials,
    listCategories,
  };
}
