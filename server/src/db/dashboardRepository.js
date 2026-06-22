export function createDashboardRepository(pool) {
  async function run(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
  }

  async function run1(sql, params = []) {
    return (await run(sql, params))[0];
  }

  // warehouseIds = null means all warehouses (admin)
  async function countSerialsByStatus({ warehouseIds }) {
    return run(
      `SELECT current_status AS "status", COUNT(*)::int AS "count"
       FROM serial_master
       WHERE ($1::bigint[] IS NULL OR current_warehouse_id = ANY($1::bigint[]))
       GROUP BY current_status
       ORDER BY COUNT(*) DESC`,
      [warehouseIds]
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

  async function countInStockByWarehouse({ warehouseIds }) {
    return run(
      `SELECT sm.current_warehouse_id AS "warehouseId",
              w.code AS "warehouseCode",
              COUNT(*)::int AS "count"
       FROM serial_master sm
       LEFT JOIN warehouse w ON w.warehouse_id = sm.current_warehouse_id
       WHERE sm.current_status = 'IN_STOCK'
         AND ($1::bigint[] IS NULL OR sm.current_warehouse_id = ANY($1::bigint[]))
       GROUP BY sm.current_warehouse_id, w.code
       ORDER BY COUNT(*) DESC`,
      [warehouseIds]
    );
  }

  async function ageingBuckets({ warehouseIds }) {
    return run(
      `SELECT
         CASE
           WHEN EXTRACT(DAY FROM (now() - received_at)) <= 30 THEN '0-30'
           WHEN EXTRACT(DAY FROM (now() - received_at)) <= 60 THEN '31-60'
           WHEN EXTRACT(DAY FROM (now() - received_at)) <= 90 THEN '61-90'
           ELSE '91+'
         END AS "label",
         COUNT(*)::int AS "value"
       FROM serial_master
       WHERE current_status = 'IN_STOCK'
         AND received_at IS NOT NULL
         AND ($1::bigint[] IS NULL OR current_warehouse_id = ANY($1::bigint[]))
       GROUP BY 1
       ORDER BY MIN(received_at)`,
      [warehouseIds]
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
  };
}
