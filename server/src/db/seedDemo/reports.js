import { createdBy } from "./constants.js";
import { q1, insertEvent } from "./helpers.js";

// ─── 10. Lifecycle serial events ──────────────────────────────────────────────

export async function seedLifecycleEvents(client, refs, s, batches, grnIds, dispData, srnIds) {
  const sid = s["LIFECYCLE"];
  const w = refs.wh;
  const { disp } = dispData;

  const now = new Date();
  function daysAgo(n) { return new Date(now - n * 86400000).toISOString(); }

  // Full lifecycle timeline for DEMO-LIFECYCLE-0001
  await insertEvent(client, sid, "PRODUCTION",       w["PLNT-01"], "IMPORT",        batches.PROD_P1_001, batches.PROD_P1_001, daysAgo(50));
  await insertEvent(client, sid, "FACTORY_DISPATCH", w["PLNT-01"], "SAP_DISPATCH",  null,                null,                daysAgo(45));
  await insertEvent(client, sid, "GRN",              w["CW-01"],   "GRN",           grnIds.CW01_001,     null,                daysAgo(44));
  await insertEvent(client, sid, "CUSTOMER_DISPATCH",w["CW-01"],   "DISPATCH",      disp.LIFECYCLE_1,    null,                daysAgo(10));
  await insertEvent(client, sid, "SRN",              w["CW-01"],   "SRN",           srnIds.LIFECYCLE,    null,                daysAgo(5));
  await insertEvent(client, sid, "CUSTOMER_DISPATCH",w["CW-01"],   "DISPATCH",      disp.LIFECYCLE_2,    null,                daysAgo(2));
  await insertEvent(client, sid, "CORRECTION",       w["CW-01"],   "EXCEPTION",     null,                null,                daysAgo(1));
}

// ─── 11. Reconciliation run (IDM-08) ─────────────────────────────────────────

export async function seedReconciliation(client, refs) {
  const w = refs.wh;
  const p = refs.prod;

  const run = await q1(client,
    `INSERT INTO opening_stock_reconciliation_run (warehouse_id, source_ref, status, created_by)
     VALUES ($1,'DEMO-RECON-2026-Q2','CALCULATED',$2)
     RETURNING reconciliation_run_id`,
    [w["CW-01"], createdBy]
  );
  const runId = Number(run.reconciliation_run_id);

  for (const [productCode, sapQty, idmQty] of [
    ["MTK-INVERTER-1KVA", 50, 44],
    ["MTK-BATTERY-100AH", 30, 28],
    ["MTK-SOLAR-300W",    20, 12],
  ]) {
    await client.query(
      `INSERT INTO opening_stock_reconciliation_line (reconciliation_run_id, product_id, sap_quantity, idm_quantity, variance_quantity, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (reconciliation_run_id, product_id) DO NOTHING`,
      [runId, p[productCode], sapQty, idmQty, idmQty - sapQty, createdBy]
    );
  }
}

// ─── 12. Refresh ageing MV ────────────────────────────────────────────────────

export async function refreshAgeingMV(client) {
  await client.query("REFRESH MATERIALIZED VIEW ageing_serial_snapshot");
}
