/**
 * Comprehensive demo seed covering all 10 IDM modules.
 * Uses created_by = "DEMO" so teardown is isolated from the dev seed.
 *
 * Run:      node src/db/seed-demo.js
 * Teardown: node src/db/seed-demo.js teardown
 */

import pg from "pg";
import { loadConfig } from "../config.js";

const createdBy = "DEMO";
const HASH = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6"; // admin123

// Received-at dates for ageing buckets (relative to 2026-06-22)
const D3  = "2026-06-19"; // B0_30
const D4  = "2026-06-18"; // B0_30
const D5  = "2026-06-17"; // B0_30
const D10 = "2026-06-12"; // B0_30
const D33 = "2026-05-20"; // B31_60
const D45 = "2026-05-08"; // B31_60
const D75 = "2026-04-08"; // B61_90
const D100 = "2026-03-14"; // B91_PLUS

// ─── helpers ─────────────────────────────────────────────────────────────────

async function q(client, sql, values = []) {
  return (await client.query(sql, values)).rows;
}

async function q1(client, sql, values = []) {
  return (await q(client, sql, values))[0];
}

async function insertSerial(client, serialNo, productId, status, warehouseId, receivedAt, batchId) {
  const row = await q1(client,
    `INSERT INTO serial_master (serial_no, product_id, current_status, current_warehouse_id, received_at, batch_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (serial_no) DO UPDATE SET
       current_status=EXCLUDED.current_status, current_warehouse_id=EXCLUDED.current_warehouse_id,
       received_at=EXCLUDED.received_at, batch_id=EXCLUDED.batch_id,
       updated_at=now(), updated_by=EXCLUDED.created_by
     RETURNING serial_id`,
    [serialNo, productId, status, warehouseId, receivedAt, batchId, createdBy]
  );
  return Number(row.serial_id);
}

async function insertEvent(client, serialId, eventType, warehouseId, refType, refId, batchId, eventAt = null) {
  await client.query(
    `INSERT INTO serial_event (serial_id, event_type, warehouse_id, reference_type, reference_id, batch_id, event_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now()),$8)`,
    [serialId, eventType, warehouseId, refType, refId, batchId, eventAt, createdBy]
  );
}

// ─── teardown ────────────────────────────────────────────────────────────────

async function teardown(client) {
  const steps = [
    `DELETE FROM integration_batch_rejection WHERE batch_id IN (SELECT batch_id FROM integration_batch WHERE created_by = '${createdBy}')`,
    `DELETE FROM battery_pre_billing WHERE created_by = '${createdBy}'`,
    `DELETE FROM srn_scan WHERE created_by = '${createdBy}'`,
    `DELETE FROM srn WHERE created_by = '${createdBy}'`,
    `DELETE FROM dispatch_scan WHERE created_by = '${createdBy}'`,
    `DELETE FROM dispatch_line WHERE created_by = '${createdBy}'`,
    `DELETE FROM dispatch WHERE created_by = '${createdBy}'`,
    `DELETE FROM invoice_line WHERE created_by = '${createdBy}'`,
    `DELETE FROM invoice WHERE created_by = '${createdBy}'`,
    `DELETE FROM grn_scan WHERE created_by = '${createdBy}'`,
    `DELETE FROM grn WHERE created_by = '${createdBy}'`,
    `DELETE FROM sap_dispatch_line WHERE created_by = '${createdBy}'`,
    `DELETE FROM sap_dispatch_doc WHERE created_by = '${createdBy}'`,
    `DELETE FROM serial_event WHERE created_by = '${createdBy}'`,
    `DELETE FROM exception_log WHERE created_by = '${createdBy}'`,
    `DELETE FROM opening_stock_reconciliation_line WHERE created_by = '${createdBy}'`,
    `DELETE FROM opening_stock_reconciliation_run WHERE created_by = '${createdBy}'`,
    `DELETE FROM serial_master WHERE created_by = '${createdBy}'`,
    `DELETE FROM integration_batch WHERE created_by = '${createdBy}'`,
    `DELETE FROM auth_session WHERE app_user_id IN (SELECT app_user_id FROM app_user WHERE created_by = '${createdBy}')`,
    `DELETE FROM app_user_warehouse WHERE app_user_id IN (SELECT app_user_id FROM app_user WHERE created_by = '${createdBy}')`,
    `DELETE FROM app_user WHERE created_by = '${createdBy}'`,
  ];
  for (const sql of steps) await client.query(sql);
  console.log("Demo data removed.");
}

// ─── load existing reference IDs ─────────────────────────────────────────────

async function loadRefs(client) {
  const whs   = await q(client, "SELECT warehouse_id AS id, code FROM warehouse");
  const prods = await q(client, "SELECT product_id AS id, product_code AS code FROM product");
  const roles = await q(client, "SELECT role_id AS id, code FROM role");
  return {
    wh:   Object.fromEntries(whs.map(r => [r.code, Number(r.id)])),
    prod: Object.fromEntries(prods.map(r => [r.code, Number(r.id)])),
    role: Object.fromEntries(roles.map(r => [r.code, Number(r.id)])),
  };
}

// ─── 1. Warehouses ────────────────────────────────────────────────────────────

async function seedWarehouses(client) {
  for (const [code, name, type] of [
    ["PLNT-02", "Microtek Plant 02",                 "PLANT"],
    ["CW-02",   "Microtek Central Warehouse 02",     "CENTRAL"],
    ["RW-04",   "Microtek Regional Warehouse 04",    "REGIONAL"],
    ["RW-05",   "Microtek Regional Warehouse 05",    "REGIONAL"],
  ]) {
    await client.query(
      `INSERT INTO warehouse (code, name, type, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=EXCLUDED.created_by`,
      [code, name, type, createdBy]
    );
  }
}

// ─── 2. Users ─────────────────────────────────────────────────────────────────

async function seedUsers(client, refs) {
  for (const { username, displayName, roleCode, defaultWh, warehouses } of [
    { username:"supervisor_2", displayName:"Central Supervisor (CW-02)", roleCode:"supervisor",          defaultWh:"CW-02", warehouses:["CW-01","CW-02"] },
    { username:"operator_2",   displayName:"Regional Operator (RW-01)",  roleCode:"warehouse_operator", defaultWh:"RW-01", warehouses:["RW-01"] },
    { username:"operator_3",   displayName:"Regional Operator (RW-02)",  roleCode:"warehouse_operator", defaultWh:"RW-02", warehouses:["RW-02"] },
    { username:"operator_4",   displayName:"Regional Operator (RW-03)",  roleCode:"warehouse_operator", defaultWh:"RW-03", warehouses:["RW-03"] },
  ]) {
    const u = await q1(client,
      `INSERT INTO app_user (username, display_name, password_hash, role_id, default_warehouse_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (username) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=now(), updated_by=EXCLUDED.created_by
       RETURNING app_user_id`,
      [username, displayName, HASH, refs.role[roleCode], refs.wh[defaultWh], createdBy]
    );
    const uid = Number(u.app_user_id);
    // Replace warehouse assignments
    await client.query(`DELETE FROM app_user_warehouse WHERE app_user_id=$1 AND created_by=$2`, [uid, createdBy]);
    for (const wc of warehouses) {
      await client.query(
        `INSERT INTO app_user_warehouse (app_user_id, warehouse_id, created_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [uid, refs.wh[wc], createdBy]
      );
    }
  }
}

// ─── 3. Integration batches ───────────────────────────────────────────────────

async function seedBatches(client) {
  const ids = {};
  for (const [key, dir, type, ref, src, status, count] of [
    ["PROD_P1_001", "INBOUND",  "PRODUCTION",       "DEMO-PROD-PLNT01-001",   "SAP-ECC", "PROCESSED", 30],
    ["PROD_P2_001", "INBOUND",  "PRODUCTION",       "DEMO-PROD-PLNT02-001",   "SAP-ECC", "PROCESSED", 25],
    ["PROD_P1_002", "INBOUND",  "PRODUCTION",       "DEMO-PROD-PLNT01-002",   "SAP-ECC", "PROCESSED", 20],
    ["FDISP_CW01",  "INBOUND",  "FACTORY_DISPATCH", "DEMO-FDISP-PLNT01-CW01", "SAP-ECC", "PROCESSED", 20],
    ["FDISP_CW02",  "INBOUND",  "FACTORY_DISPATCH", "DEMO-FDISP-PLNT02-CW02", "SAP-ECC", "PROCESSED", 15],
    ["PROD_P2_002", "INBOUND",  "PRODUCTION",       "DEMO-PROD-PLNT02-002",   "SAP-ECC", "PENDING",   12],
    ["AGEING",      "OUTBOUND", "AGEING",           "DEMO-AGEING-2026-06",    "SAP-BW",  "PROCESSED", 0],
    ["FAILED",      "INBOUND",  "PRODUCTION",       "DEMO-IMPORT-FAILED-001", "SAP-ECC", "FAILED",    5],
  ]) {
    const row = await q1(client,
      `INSERT INTO integration_batch (direction, payload_type, external_ref, source_system, status, record_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (direction, payload_type, external_ref) DO UPDATE SET status=EXCLUDED.status, updated_at=now(), updated_by=EXCLUDED.created_by
       RETURNING batch_id`,
      [dir, type, ref, src, status, count, createdBy]
    );
    ids[key] = Number(row.batch_id);
  }
  // Rejection rows for the failed batch
  for (const [idx, sn, reason] of [
    [0, "DEMO-FAIL-0001", "Duplicate serial in payload"],
    [1, "DEMO-FAIL-0002", "Unknown product code MTK-XYZ-9999"],
  ]) {
    await client.query(
      `INSERT INTO integration_batch_rejection (batch_id, row_index, serial_no, reason)
       VALUES ($1,$2,$3,$4) ON CONFLICT (batch_id, row_index) DO NOTHING`,
      [ids.FAILED, idx, sn, reason]
    );
  }
  return ids;
}

// ─── 4. Serials ───────────────────────────────────────────────────────────────

async function seedSerials(client, refs, batches) {
  const s = {};

  const p = refs.prod;
  const w = refs.wh;

  // B1: INV1K at CW-01, IN_STOCK, D5 (B0_30)
  for (let i = 101; i <= 112; i++) {
    const k = `INV1K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV1K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-1KVA"], "IN_STOCK", w["CW-01"], D5, batches.PROD_P1_001);
  }

  // B2: INV1K IN_TRANSIT (open GRN batch)
  for (let i = 201; i <= 208; i++) {
    const k = `INV1K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV1K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-1KVA"], "IN_TRANSIT", w["CW-01"], null, batches.FDISP_CW01);
  }

  // B3: BAT100 at CW-01, IN_STOCK, D4 (B0_30)
  for (let i = 101; i <= 112; i++) {
    const k = `BAT100_${i}`;
    s[k] = await insertSerial(client, `DEMO-BAT100-${String(i).padStart(4,"0")}`, p["MTK-BATTERY-100AH"], "IN_STOCK", w["CW-01"], D4, batches.PROD_P1_001);
  }

  // B4: BAT100 IN_TRANSIT
  for (let i = 201; i <= 206; i++) {
    const k = `BAT100_${i}`;
    s[k] = await insertSerial(client, `DEMO-BAT100-${String(i).padStart(4,"0")}`, p["MTK-BATTERY-100AH"], "IN_TRANSIT", w["CW-01"], null, batches.FDISP_CW01);
  }

  // B5: SOL300 at RW-01, IN_STOCK, D45 (B31_60)
  for (let i = 101; i <= 112; i++) {
    const k = `SOL300_${i}`;
    s[k] = await insertSerial(client, `DEMO-SOL300-${String(i).padStart(4,"0")}`, p["MTK-SOLAR-300W"], "IN_STOCK", w["RW-01"], D45, batches.PROD_P2_001);
  }

  // B6: INV2K at RW-02, IN_STOCK, D75 (B61_90) — 11 received, 1 short (IN_TRANSIT)
  for (let i = 101; i <= 111; i++) {
    const k = `INV2K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV2K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-2KVA"], "IN_STOCK", w["RW-02"], D75, batches.PROD_P2_001);
  }
  s["INV2K_112"] = await insertSerial(client, "DEMO-INV2K-0112", p["MTK-INVERTER-2KVA"], "IN_TRANSIT", w["RW-02"], null, batches.PROD_P2_001);

  // B7: BAT150 at RW-01, IN_STOCK, D100 (B91_PLUS)
  for (let i = 101; i <= 112; i++) {
    const k = `BAT150_${i}`;
    s[k] = await insertSerial(client, `DEMO-BAT150-${String(i).padStart(4,"0")}`, p["MTK-BATTERY-150AH"], "IN_STOCK", w["RW-01"], D100, batches.PROD_P1_002);
  }

  // B8: INV1K at RW-03, IN_STOCK, D3 (B0_30)
  for (let i = 301; i <= 308; i++) {
    const k = `INV1K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV1K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-1KVA"], "IN_STOCK", w["RW-03"], D3, batches.PROD_P1_002);
  }

  // B9: SOL500 at CW-02, IN_STOCK, D33 (B31_60)
  for (let i = 101; i <= 110; i++) {
    const k = `SOL500_${i}`;
    s[k] = await insertSerial(client, `DEMO-SOL500-${String(i).padStart(4,"0")}`, p["MTK-SOLAR-500W"], "IN_STOCK", w["CW-02"], D33, batches.FDISP_CW02);
  }

  // B10: CHGC at RW-04, IN_STOCK, D10 (B0_30)
  for (let i = 101; i <= 106; i++) {
    const k = `CHGC_${i}`;
    s[k] = await insertSerial(client, `DEMO-CHGC-${String(i).padStart(4,"0")}`, p["MTK-CHARGE-CONTROLLER"], "IN_STOCK", w["RW-04"], D10, batches.PROD_P2_002);
  }

  // Special serials
  s["SAL_0001"]     = await insertSerial(client, "DEMO-SRN-SAL-0001",   p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   null);
  s["SAL_0002"]     = await insertSerial(client, "DEMO-SRN-SAL-0002",   p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   null);
  s["DEF_0001"]     = await insertSerial(client, "DEMO-SRN-DEF-0001",   p["MTK-BATTERY-100AH"],  "IN_STOCK", w["CW-01"], D4,   null);
  s["WRONGWH_0001"] = await insertSerial(client, "DEMO-WRONGWH-0001",   p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["RW-02"], D75,  null);
  s["EXCESS_0001"]  = await insertSerial(client, "DEMO-EXCESS-0001",    p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   null);
  s["LIFECYCLE"]    = await insertSerial(client, "DEMO-LIFECYCLE-0001", p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   batches.PROD_P1_001);

  return s;
}

// ─── 5. SAP dispatch docs ─────────────────────────────────────────────────────

async function seedSapDocs(client, refs, s, batches) {
  const docs = {};
  const p = refs.prod;
  const w = refs.wh;

  async function doc(key, ref, srcWh, destWh, status, batchId) {
    const row = await q1(client,
      `INSERT INTO sap_dispatch_doc (external_ref, source_warehouse_id, destination_warehouse_id, status, batch_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (external_ref) DO UPDATE SET status=EXCLUDED.status, updated_at=now(), updated_by=EXCLUDED.created_by
       RETURNING sap_dispatch_doc_id`,
      [ref, srcWh, destWh, status, batchId, createdBy]
    );
    docs[key] = Number(row.sap_dispatch_doc_id);
  }

  await doc("CW01_001", "DEMO-SAPDISP-CW01-001", w["PLNT-01"], w["CW-01"], "GRN_CLOSED",       batches.FDISP_CW01);
  await doc("CW01_002", "DEMO-SAPDISP-CW01-002", w["PLNT-01"], w["CW-01"], "GRN_IN_PROGRESS",  batches.FDISP_CW01);
  await doc("CW02_001", "DEMO-SAPDISP-CW02-001", w["PLNT-02"], w["CW-02"], "GRN_CLOSED",       batches.FDISP_CW02);
  await doc("RW01_001", "DEMO-SAPDISP-RW01-001", w["CW-01"],  w["RW-01"], "GRN_CLOSED",       null);
  await doc("RW02_001", "DEMO-SAPDISP-RW02-001", w["CW-01"],  w["RW-02"], "GRN_CLOSED",       null);

  async function line(docId, serialId, productId, lineNo) {
    await client.query(
      `INSERT INTO sap_dispatch_line (sap_dispatch_doc_id, serial_id, product_id, line_no, created_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sap_dispatch_doc_id, serial_id) DO NOTHING`,
      [docId, serialId, productId, lineNo, createdBy]
    );
  }

  // CW01_001: INV1K 0101-0112, BAT100 0101-0112
  let ln = 1;
  for (let i = 101; i <= 112; i++) await line(docs.CW01_001, s[`INV1K_${i}`], p["MTK-INVERTER-1KVA"], ln++);
  for (let i = 101; i <= 112; i++) await line(docs.CW01_001, s[`BAT100_${i}`], p["MTK-BATTERY-100AH"], ln++);

  // CW01_002: INV1K 0201-0208, BAT100 0201-0206 (all IN_TRANSIT)
  ln = 1;
  for (let i = 201; i <= 208; i++) await line(docs.CW01_002, s[`INV1K_${i}`], p["MTK-INVERTER-1KVA"], ln++);
  for (let i = 201; i <= 206; i++) await line(docs.CW01_002, s[`BAT100_${i}`], p["MTK-BATTERY-100AH"], ln++);

  // CW02_001: SOL500 0101-0110
  ln = 1;
  for (let i = 101; i <= 110; i++) await line(docs.CW02_001, s[`SOL500_${i}`], p["MTK-SOLAR-500W"], ln++);

  // RW01_001: SOL300 0101-0112
  ln = 1;
  for (let i = 101; i <= 112; i++) await line(docs.RW01_001, s[`SOL300_${i}`], p["MTK-SOLAR-300W"], ln++);

  // RW02_001: INV2K 0101-0112 (including the short one)
  ln = 1;
  for (let i = 101; i <= 112; i++) await line(docs.RW02_001, s[`INV2K_${i}`], p["MTK-INVERTER-2KVA"], ln++);

  return docs;
}

// ─── 6. GRNs ──────────────────────────────────────────────────────────────────

async function seedGrns(client, refs, s, docs) {
  const g = {};
  const w = refs.wh;

  async function grn(key, docId, whId, status, closed) {
    // grn.sap_dispatch_doc_id is nullable + no longer unique (V017), but for demo
    // each doc gets one GRN; use ON CONFLICT DO NOTHING as a safety net.
    const row = await q1(client,
      `INSERT INTO grn (sap_dispatch_doc_id, receiving_warehouse_id, status, completed_at, created_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING
       RETURNING grn_id`,
      [docId, whId, status, closed ? new Date().toISOString() : null, createdBy]
    );
    if (row) {
      g[key] = Number(row.grn_id);
    } else {
      const ex = await q1(client, `SELECT grn_id FROM grn WHERE sap_dispatch_doc_id=$1 AND created_by=$2`, [docId, createdBy]);
      g[key] = ex ? Number(ex.grn_id) : null;
    }
  }

  await grn("CW01_001", docs.CW01_001, w["CW-01"], "CLOSED",       true);
  await grn("CW02_001", docs.CW02_001, w["CW-02"], "CLOSED",       true);
  await grn("RW01_001", docs.RW01_001, w["RW-01"], "CLOSED",       true);
  await grn("RW02_001", docs.RW02_001, w["RW-02"], "CLOSED",       true);
  await grn("CW01_002", docs.CW01_002, w["CW-01"], "IN_PROGRESS",  false);

  async function matchedScan(grnId, serialId, serialNo, scannedBy) {
    await client.query(
      `INSERT INTO grn_scan (grn_id, serial_id, serial_no, match_status, scanned_by, created_by)
       VALUES ($1,$2,$3,'MATCHED',$4,$5) ON CONFLICT DO NOTHING`,
      [grnId, serialId, serialNo, scannedBy, createdBy]
    );
  }

  // CW01_001 scans (CLOSED): INV1K + BAT100, all MATCHED
  if (g.CW01_001) {
    for (let i = 101; i <= 112; i++) await matchedScan(g.CW01_001, s[`INV1K_${i}`], `DEMO-INV1K-${String(i).padStart(4,"0")}`, "operator_2");
    for (let i = 101; i <= 112; i++) await matchedScan(g.CW01_001, s[`BAT100_${i}`], `DEMO-BAT100-${String(i).padStart(4,"0")}`, "operator_2");
  }

  // CW02_001 scans (CLOSED): SOL500 all MATCHED
  if (g.CW02_001) {
    for (let i = 101; i <= 110; i++) await matchedScan(g.CW02_001, s[`SOL500_${i}`], `DEMO-SOL500-${String(i).padStart(4,"0")}`, "supervisor_2");
  }

  // RW01_001 scans (CLOSED): SOL300 all MATCHED
  if (g.RW01_001) {
    for (let i = 101; i <= 112; i++) await matchedScan(g.RW01_001, s[`SOL300_${i}`], `DEMO-SOL300-${String(i).padStart(4,"0")}`, "operator_2");
  }

  // RW02_001 scans (CLOSED): INV2K 0101-0111 MATCHED + 1 SHORT
  if (g.RW02_001) {
    for (let i = 101; i <= 111; i++) await matchedScan(g.RW02_001, s[`INV2K_${i}`], `DEMO-INV2K-${String(i).padStart(4,"0")}`, "operator_3");
    // SHORT: serial_id NULL (never received)
    await client.query(
      `INSERT INTO grn_scan (grn_id, serial_id, serial_no, match_status, scanned_by, created_by)
       VALUES ($1,NULL,'DEMO-INV2K-0112','SHORT',$2,$3)
       ON CONFLICT (grn_id, serial_no, match_status) WHERE match_status='SHORT' DO NOTHING`,
      [g.RW02_001, "operator_3", createdBy]
    );
  }

  // CW01_002 scans (IN_PROGRESS): 6 INV1K matched, + 1 WRONG_SERIAL
  if (g.CW01_002) {
    for (let i = 201; i <= 206; i++) {
      const sid = s[`INV1K_${i}`];
      await matchedScan(g.CW01_002, sid, `DEMO-INV1K-${String(i).padStart(4,"0")}`, "operator_2");
      // Flip to IN_STOCK at CW-01 (simulating GRN receipt)
      await client.query(
        `UPDATE serial_master SET current_status='IN_STOCK', current_warehouse_id=$1, received_at=$2, updated_at=now(), updated_by=$3 WHERE serial_id=$4`,
        [w["CW-01"], D3, createdBy, sid]
      );
    }
    await client.query(
      `INSERT INTO grn_scan (grn_id, serial_id, serial_no, match_status, scanned_by, created_by)
       VALUES ($1,NULL,'DEMO-UNKNOWN-9999','WRONG_SERIAL',$2,$3)`,
      [g.CW01_002, "operator_2", createdBy]
    );
  }

  return g;
}

// ─── 7. Invoices + dispatches ─────────────────────────────────────────────────

async function seedInvoicesAndDispatches(client, refs, s) {
  const inv = {};
  const disp = {};
  const dscans = {}; // dispatch_scan_id by serial key

  const p = refs.prod;
  const w = refs.wh;

  async function invoice(key, sapRef, customerName, status, _opts = {}) {
    const row = await q1(client,
      `INSERT INTO invoice (sap_invoice_ref, customer_name, status, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (sap_invoice_ref) DO UPDATE SET status=EXCLUDED.status, updated_at=now(), updated_by=EXCLUDED.created_by
       RETURNING invoice_id`,
      [sapRef, customerName, status, createdBy]
    );
    inv[key] = Number(row.invoice_id);
  }

  async function invLine(invoiceId, productId, lineNo, qty) {
    const row = await q1(client,
      `INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (invoice_id, line_no) DO UPDATE SET required_quantity=EXCLUDED.required_quantity, updated_at=now(), updated_by=EXCLUDED.created_by
       RETURNING invoice_line_id`,
      [invoiceId, productId, lineNo, qty, createdBy]
    );
    return Number(row.invoice_line_id);
  }

  async function dispatch(key, invoiceId, whId, status, completedAt = null) {
    const row = await q1(client,
      `INSERT INTO dispatch (invoice_id, warehouse_id, status, completed_at, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING dispatch_id`,
      [invoiceId, whId, status, completedAt, createdBy]
    );
    disp[key] = Number(row.dispatch_id);
  }

  async function scan(dKey, dispatchId, lineId, serialId, serialKey) {
    const row = await q1(client,
      `INSERT INTO dispatch_scan (dispatch_id, invoice_line_id, serial_id, scanned_by, created_by)
       VALUES ($1,$2,$3,'operator_1',$4)
       ON CONFLICT DO NOTHING
       RETURNING dispatch_scan_id`,
      [dispatchId, lineId, serialId, createdBy]
    );
    if (row) dscans[serialKey] = Number(row.dispatch_scan_id);
    // Flip serial to DISPATCHED
    await client.query(
      `UPDATE serial_master SET current_status='DISPATCHED', updated_at=now(), updated_by=$1 WHERE serial_id=$2`,
      [createdBy, serialId]
    );
  }

  // ── DEMO-INV-RET-SRC-001: Return source invoice (CW-01, INV1K×2 + BAT100×1, DISPATCHED)
  await invoice("RET_SRC", "DEMO-INV-RET-SRC-001", "Metro Electricals Pvt Ltd", "DISPATCHED");
  const retSrcL1 = await invLine(inv.RET_SRC, p["MTK-INVERTER-1KVA"], 1, 2);
  const retSrcL2 = await invLine(inv.RET_SRC, p["MTK-BATTERY-100AH"],  2, 1);
  await dispatch("RET_SRC", inv.RET_SRC, w["CW-01"], "DISPATCHED", new Date().toISOString());
  await scan("RET_SRC", disp.RET_SRC, retSrcL1, s["SAL_0001"], "SAL_0001");
  await scan("RET_SRC", disp.RET_SRC, retSrcL1, s["SAL_0002"], "SAL_0002");
  await scan("RET_SRC", disp.RET_SRC, retSrcL2, s["DEF_0001"], "DEF_0001");

  // ── DEMO-INV-FULL-001: Fully dispatched (CW-01, INV1K×4)
  await invoice("FULL_001", "DEMO-INV-FULL-001", "Sunrise Power Solutions", "DISPATCHED");
  const full001L1 = await invLine(inv.FULL_001, p["MTK-INVERTER-1KVA"], 1, 4);
  await dispatch("FULL_001", inv.FULL_001, w["CW-01"], "DISPATCHED", new Date().toISOString());
  for (const i of [101, 102, 103, 104]) await scan("FULL_001", disp.FULL_001, full001L1, s[`INV1K_${i}`], `INV1K_${i}`);

  // ── DEMO-INV-FULL-002: Fully dispatched (RW-01, SOL300×3)
  await invoice("FULL_002", "DEMO-INV-FULL-002", "Greenline Distributors", "DISPATCHED");
  const full002L1 = await invLine(inv.FULL_002, p["MTK-SOLAR-300W"], 1, 3);
  await dispatch("FULL_002", inv.FULL_002, w["RW-01"], "DISPATCHED", new Date().toISOString());
  for (const i of [101, 102, 103]) await scan("FULL_002", disp.FULL_002, full002L1, s[`SOL300_${i}`], `SOL300_${i}`);

  // ── DEMO-INV-PARTIAL-001: Partially dispatched (RW-02, INV2K×6, 3 scanned)
  await invoice("PARTIAL_001", "DEMO-INV-PARTIAL-001", "Coastal Energy Traders", "PARTIALLY_DISPATCHED");
  const partial001L1 = await invLine(inv.PARTIAL_001, p["MTK-INVERTER-2KVA"], 1, 6);
  await dispatch("PARTIAL_001", inv.PARTIAL_001, w["RW-02"], "IN_PROGRESS");
  for (const i of [101, 102, 103]) await scan("PARTIAL_001", disp.PARTIAL_001, partial001L1, s[`INV2K_${i}`], `INV2K_${i}`);

  // ── DEMO-INV-INPROG-001: In-progress dispatch (RW-01, SOL300×4, 2 scanned)
  await invoice("INPROG_001", "DEMO-INV-INPROG-001", "Shakti Energy Solutions", "PARTIALLY_DISPATCHED");
  const inprog001L1 = await invLine(inv.INPROG_001, p["MTK-SOLAR-300W"], 1, 4);
  await dispatch("INPROG_001", inv.INPROG_001, w["RW-01"], "IN_PROGRESS");
  for (const i of [104, 105]) await scan("INPROG_001", disp.INPROG_001, inprog001L1, s[`SOL300_${i}`], `SOL300_${i}`);

  // ── DEMO-INV-PENDING-001: Pending invoice (RW-04, CHGC×6, no scans)
  await invoice("PENDING_001", "DEMO-INV-PENDING-001", "Bharat Electricals Ltd", "PENDING");
  await invLine(inv.PENDING_001, p["MTK-CHARGE-CONTROLLER"], 1, 6);
  await dispatch("PENDING_001", inv.PENDING_001, w["RW-04"], "PENDING");

  // ── DEMO-INV-BAT-FULL-001: Battery invoice fully pre-billed + dispatched (CW-01, BAT100×4)
  await invoice("BAT_FULL", "DEMO-INV-BAT-FULL-001", "Aarav Power Systems", "DISPATCHED");
  const batFullL1 = await invLine(inv.BAT_FULL, p["MTK-BATTERY-100AH"], 1, 4);
  await dispatch("BAT_FULL", inv.BAT_FULL, w["CW-01"], "DISPATCHED", new Date().toISOString());
  for (const i of [101, 102, 103, 104]) {
    // Pre-bill first
    await client.query(
      `INSERT INTO battery_pre_billing (invoice_line_id, serial_id, committed_by, created_by)
       VALUES ($1,$2,'operator_1',$3) ON CONFLICT (serial_id) DO NOTHING`,
      [batFullL1, s[`BAT100_${i}`], createdBy]
    );
    await scan("BAT_FULL", disp.BAT_FULL, batFullL1, s[`BAT100_${i}`], `BAT100_${i}`);
  }

  // ── DEMO-INV-BAT-PARTIAL-001: Battery invoice partially pre-billed, not dispatched (CW-01, BAT100×6)
  await invoice("BAT_PARTIAL", "DEMO-INV-BAT-PARTIAL-001", "Metro Electricals Ltd", "PENDING");
  const batPartL1 = await invLine(inv.BAT_PARTIAL, p["MTK-BATTERY-100AH"], 1, 6);
  await dispatch("BAT_PARTIAL", inv.BAT_PARTIAL, w["CW-01"], "PENDING");
  for (const i of [105, 106, 107]) {
    await client.query(
      `INSERT INTO battery_pre_billing (invoice_line_id, serial_id, committed_by, created_by)
       VALUES ($1,$2,'operator_1',$3) ON CONFLICT (serial_id) DO NOTHING`,
      [batPartL1, s[`BAT100_${i}`], createdBy]
    );
  }

  // ── Lifecycle invoices (for DEMO-LIFECYCLE-0001 full serial history)
  await invoice("LIFECYCLE_1", "DEMO-INV-LIFECYCLE-001", "NovaTech Distributors", "DISPATCHED");
  const lc1L1 = await invLine(inv.LIFECYCLE_1, p["MTK-INVERTER-1KVA"], 1, 1);
  await dispatch("LIFECYCLE_1", inv.LIFECYCLE_1, w["CW-01"], "DISPATCHED", new Date().toISOString());
  await scan("LIFECYCLE_1", disp.LIFECYCLE_1, lc1L1, s["LIFECYCLE"], "LIFECYCLE");

  // SRN will return LIFECYCLE, then re-dispatch on LIFECYCLE_2
  await invoice("LIFECYCLE_2", "DEMO-INV-LIFECYCLE-002", "NovaTech Distributors", "DISPATCHED");
  const lc2L1 = await invLine(inv.LIFECYCLE_2, p["MTK-INVERTER-1KVA"], 1, 1);
  await dispatch("LIFECYCLE_2", inv.LIFECYCLE_2, w["CW-01"], "DISPATCHED", new Date().toISOString());

  return { inv, disp, dscans, lc1L1, lc2L1, full001L1, batFullL1, batPartL1 };
}

// ─── 8. SRNs ──────────────────────────────────────────────────────────────────

async function seedSrns(client, refs, s, dispData) {
  const { inv, dscans, lc2L1 } = dispData;
  const srnIds = {};
  const w = refs.wh;

  async function srn(key, invoiceId, whId, status, expectedQty, productIds) {
    const row = await q1(client,
      `INSERT INTO srn (invoice_id, receiving_warehouse_id, status, expected_quantity, return_product_ids, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING srn_id`,
      [invoiceId, whId, status, expectedQty, JSON.stringify(productIds), createdBy]
    );
    srnIds[key] = Number(row.srn_id);
  }

  // SRN A: Saleable returns from RET_SRC invoice (SAL_0001, SAL_0002 → SALEABLE)
  await srn("SAL", inv.RET_SRC, w["CW-01"], "CLOSED", 2, [refs.prod["MTK-INVERTER-1KVA"]]);
  for (const [serialKey, condTag] of [["SAL_0001", "SALEABLE"], ["SAL_0002", "SALEABLE"]]) {
    const sid = s[serialKey];
    const origScan = dscans[serialKey];
    // Soft-return the dispatch scan
    await client.query(
      `UPDATE dispatch_scan SET returned_at=now(), returned_by='supervisor_1' WHERE dispatch_scan_id=$1`,
      [origScan]
    );
    // SRN scan
    await client.query(
      `INSERT INTO srn_scan (srn_id, serial_id, original_dispatch_scan_id, condition_tag, status, scanned_by, created_by)
       VALUES ($1,$2,$3,$4,'ACCEPTED','operator_1',$5) ON CONFLICT (serial_id) DO NOTHING`,
      [srnIds.SAL, sid, origScan, condTag, createdBy]
    );
    // Serial back to IN_STOCK with condition tag
    await client.query(
      `UPDATE serial_master SET current_status='IN_STOCK', condition_tag=$1, updated_at=now(), updated_by=$2 WHERE serial_id=$3`,
      [condTag, createdBy, sid]
    );
    await insertEvent(client, sid, "SRN", w["CW-01"], "SRN", srnIds.SAL, null);
  }

  // SRN B: Defective return from RET_SRC invoice (DEF_0001 → DEFECTIVE, on hold)
  await srn("DEF", inv.RET_SRC, w["CW-01"], "CLOSED", 1, [refs.prod["MTK-BATTERY-100AH"]]);
  {
    const sid = s["DEF_0001"];
    const origScan = dscans["DEF_0001"];
    await client.query(
      `UPDATE dispatch_scan SET returned_at=now(), returned_by='supervisor_1' WHERE dispatch_scan_id=$1`,
      [origScan]
    );
    await client.query(
      `INSERT INTO srn_scan (srn_id, serial_id, original_dispatch_scan_id, condition_tag, status, scanned_by, created_by)
       VALUES ($1,$2,$3,'DEFECTIVE','ACCEPTED','operator_1',$4) ON CONFLICT (serial_id) DO NOTHING`,
      [srnIds.DEF, sid, origScan, createdBy]
    );
    // Serial → RETURNED with DEFECTIVE tag = on condition hold
    await client.query(
      `UPDATE serial_master SET current_status='RETURNED', condition_tag='DEFECTIVE', updated_at=now(), updated_by=$1 WHERE serial_id=$2`,
      [createdBy, sid]
    );
    await insertEvent(client, sid, "SRN", w["CW-01"], "SRN", srnIds.DEF, null);
  }

  // SRN C: Open/in-progress return from FULL_002 (SOL300_101 → REPAIR, in-progress)
  await srn("OPEN", inv.FULL_002, w["RW-01"], "IN_PROGRESS", 2, [refs.prod["MTK-SOLAR-300W"]]);
  {
    const sid = s["SOL300_101"];
    const origScan = dscans["SOL300_101"];
    if (origScan) {
      await client.query(
        `UPDATE dispatch_scan SET returned_at=now(), returned_by='operator_2' WHERE dispatch_scan_id=$1`,
        [origScan]
      );
    }
    await client.query(
      `INSERT INTO srn_scan (srn_id, serial_id, original_dispatch_scan_id, condition_tag, status, scanned_by, created_by)
       VALUES ($1,$2,$3,'REPAIR','ACCEPTED','operator_2',$4) ON CONFLICT (serial_id) DO NOTHING`,
      [srnIds.OPEN, sid, origScan ?? null, createdBy]
    );
    await client.query(
      `UPDATE serial_master SET current_status='RETURNED', condition_tag='REPAIR', updated_at=now(), updated_by=$1 WHERE serial_id=$2`,
      [createdBy, sid]
    );
  }

  // SRN for LIFECYCLE-0001: return from LIFECYCLE_1, then re-dispatch on LIFECYCLE_2
  await srn("LIFECYCLE", inv.LIFECYCLE_1, w["CW-01"], "CLOSED", 1, [refs.prod["MTK-INVERTER-1KVA"]]);
  {
    const sid = s["LIFECYCLE"];
    const origScan = dscans["LIFECYCLE"];
    if (origScan) {
      await client.query(
        `UPDATE dispatch_scan SET returned_at=now(), returned_by='supervisor_1' WHERE dispatch_scan_id=$1`,
        [origScan]
      );
    }
    await client.query(
      `INSERT INTO srn_scan (srn_id, serial_id, original_dispatch_scan_id, condition_tag, status, scanned_by, created_by)
       VALUES ($1,$2,$3,'SALEABLE','ACCEPTED','operator_1',$4) ON CONFLICT (serial_id) DO NOTHING`,
      [srnIds.LIFECYCLE, sid, origScan ?? null, createdBy]
    );
    // Back to IN_STOCK for re-dispatch
    await client.query(
      `UPDATE serial_master SET current_status='IN_STOCK', condition_tag='SALEABLE', updated_at=now(), updated_by=$1 WHERE serial_id=$2`,
      [createdBy, sid]
    );
    // Now re-dispatch on LIFECYCLE_2
    await q1(client,
      `INSERT INTO dispatch_scan (dispatch_id, invoice_line_id, serial_id, scanned_by, created_by)
       VALUES ($1,$2,$3,'operator_1',$4)
       ON CONFLICT DO NOTHING
       RETURNING dispatch_scan_id`,
      [dispData.disp.LIFECYCLE_2, lc2L1, sid, createdBy]
    );
    await client.query(
      `UPDATE serial_master SET current_status='DISPATCHED', updated_at=now(), updated_by=$1 WHERE serial_id=$2`,
      [createdBy, sid]
    );
  }

  return srnIds;
}

// ─── 9. Exceptions ────────────────────────────────────────────────────────────

async function seedExceptions(client, refs, s, grnIds, dispIds, srnIds, _batches) {
  const w = refs.wh;

  async function ex(serialNo, rule, ctx, ctxId, status, raisedBy, whId, corrOpts = null) {
    const row = await q1(client,
      `INSERT INTO exception_log (serial_no, rule_code, context_type, context_id, status, raised_by, warehouse_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING exception_id`,
      [serialNo, rule, ctx, ctxId, status, raisedBy, whId, createdBy]
    );
    const eid = Number(row.exception_id);
    if (corrOpts) {
      await client.query(
        `UPDATE exception_log SET corrected_at=now(), corrected_by=$1, correction_reason=$2, correction_txn_ref=$3 WHERE exception_id=$4`,
        [corrOpts.by, corrOpts.reason, corrOpts.txnRef ?? null, eid]
      );
    }
    return eid;
  }

  // 1. SHORT — GRN RW02 (OPEN)
  await ex("DEMO-INV2K-0112", "SHORT", "GRN", grnIds.RW02_001, "OPEN", "operator_3", w["RW-02"]);

  // 2. WRONG_SERIAL — GRN CW01_002 in-progress (OPEN)
  await ex("DEMO-UNKNOWN-9999", "WRONG_SERIAL", "GRN", grnIds.CW01_002, "OPEN", "operator_2", w["CW-01"]);

  // 3. EXCESS — GRN CW01 (DISMISSED with correction)
  await ex("DEMO-EXCESS-0001", "EXCESS", "GRN", grnIds.CW01_001, "DISMISSED", "operator_2", w["CW-01"], {
    by: "supervisor_2",
    reason: "Excess unit confirmed as legitimate over-supply from Plant 01; absorbed into CW-01 stock."
  });

  // 4. WRONG_WAREHOUSE — DISPATCH (OPEN)
  await ex("DEMO-WRONGWH-0001", "WRONG_WAREHOUSE", "DISPATCH", dispIds.PARTIAL_001, "OPEN", "operator_1", w["RW-02"]);

  // 5. ALREADY_DISPATCHED — DISPATCH (CORRECTED)
  await ex("DEMO-SRN-SAL-0001", "ALREADY_DISPATCHED", "DISPATCH", dispIds.FULL_001, "CORRECTED", "operator_2", w["CW-01"], {
    by: "supervisor_1",
    reason: "Serial returned via SRN and re-stocked; re-dispatch authorised after confirming physical return.",
    txnRef: "DEMO-CORR-001"
  });

  // 6. NOT_FOUND — DISPATCH (CORRECTED)
  await ex("DEMO-NOTFOUND-0001", "NOT_FOUND", "DISPATCH", dispIds.FULL_001, "CORRECTED", "operator_1", w["CW-01"], {
    by: "supervisor_1",
    reason: "Serial was mis-keyed by operator; correct serial DEMO-INV1K-0103 was scanned on retry.",
    txnRef: "DEMO-CORR-002"
  });

  // 7. PRODUCT_INVOICE_MISMATCH — DISPATCH (OPEN)
  await ex("DEMO-SOL300-0106", "PRODUCT_INVOICE_MISMATCH", "DISPATCH", dispIds.INPROG_001, "OPEN", "operator_2", w["RW-01"]);

  // 8. CONDITION_HOLD — SRN (OPEN) — defective serial tried for re-dispatch
  await ex("DEMO-SRN-DEF-0001", "CONDITION_HOLD", "SRN", srnIds.DEF, "OPEN", "operator_2", w["CW-01"]);

  // 9. BATTERY_NOT_PREBILLED — BATTERY (DISMISSED)
  await ex("DEMO-BAT100-0105", "BATTERY_NOT_PREBILLED", "BATTERY", null, "DISMISSED", "operator_2", w["CW-01"], {
    by: "supervisor_2",
    reason: "Pre-billing was completed for this line before dispatch; exception raised due to timing window."
  });

  // 10. IMPORT_FAILED — IMPORT (OPEN) — backed by the failed batch
  await ex("DEMO-FAIL-0001", "IMPORT_FAILED", "IMPORT", null, "OPEN", "SAP-IMPORT", null, null);

  // 11. WRONG_SERIAL — GRN (CORRECTED) — lifecycle serial correction
  await ex("DEMO-LIFECYCLE-0001", "WRONG_SERIAL", "GRN", grnIds.CW01_001, "CORRECTED", "operator_2", w["CW-01"], {
    by: "supervisor_1",
    reason: "Serial confirmed as correctly received; GRN reconciliation error resolved.",
    txnRef: "DEMO-CORR-003"
  });

  // 12-16: Filler CORRECTED/DISMISSED to reach ≥10 resolved total
  const fillers = [
    ["DEMO-INV1K-0106", "DUPLICATE_SCAN",          "DISPATCH", dispIds.FULL_001, "CORRECTED", "operator_1", w["CW-01"],  { by:"supervisor_1", reason:"Duplicate scan from hardware glitch; first accepted scan retained." }],
    ["DEMO-INV1K-0107", "DISPATCH_QUANTITY_REACHED","DISPATCH", dispIds.FULL_001, "DISMISSED", "operator_1", w["CW-01"],  { by:"supervisor_1", reason:"Invoice quantity already fulfilled; operator dismissed after verification." }],
    ["DEMO-BAT100-0108","WRONG_WAREHOUSE",          "DISPATCH", dispIds.BAT_FULL, "CORRECTED", "operator_2", w["CW-01"],  { by:"supervisor_2", reason:"Serial physically relocated to CW-01 before dispatch; warehouse record updated." }],
    ["DEMO-SOL500-0108","PRODUCT_INVOICE_MISMATCH","DISPATCH",  dispIds.BAT_FULL, "CORRECTED", "operator_2", w["CW-02"],  { by:"supervisor_2", reason:"Invoice line corrected after product code mismatch identified at packing." }],
    ["DEMO-INV2K-0104", "ALREADY_DISPATCHED",      "DISPATCH",  dispIds.PARTIAL_001, "DISMISSED", "operator_3", w["RW-02"], { by:"supervisor_1", reason:"Prior dispatch was voided; serial status confirmed as IN_STOCK for re-dispatch." }],
  ];
  for (const [sn, rule, ctx, ctxId, status, raisedBy, whId, corrOpts] of fillers) {
    await ex(sn, rule, ctx, ctxId, status, raisedBy, whId, corrOpts);
  }
}

// ─── 10. Lifecycle serial events ──────────────────────────────────────────────

async function seedLifecycleEvents(client, refs, s, batches, grnIds, dispData, srnIds) {
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

async function seedReconciliation(client, refs) {
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

async function refreshAgeingMV(client) {
  await client.query("REFRESH MATERIALIZED VIEW ageing_serial_snapshot");
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();

  const command = process.argv[2];

  try {
    await client.query("BEGIN");

    if (command === "teardown") {
      await teardown(client);
      await client.query("COMMIT");
      return;
    }

    // ── seed ──
    await seedWarehouses(client);
    const refs = await loadRefs(client);

    await seedUsers(client, refs);
    const batches = await seedBatches(client);
    const serials = await seedSerials(client, refs, batches);
    const docs    = await seedSapDocs(client, refs, serials, batches);
    const grns    = await seedGrns(client, refs, serials, docs);
    const dispData = await seedInvoicesAndDispatches(client, refs, serials);
    const srnIds  = await seedSrns(client, refs, serials, dispData);
    await seedExceptions(client, refs, serials, grns, dispData.disp, srnIds, batches);
    await seedLifecycleEvents(client, refs, serials, batches, grns, dispData, srnIds);
    await seedReconciliation(client, refs);

    await client.query("COMMIT");

    // Refresh outside transaction (cannot REFRESH MATERIALIZED VIEW in a txn with concurrent reads)
    await refreshAgeingMV(client);

    console.log(JSON.stringify({
      msg: "Demo seed data ready",
      warehouses: 9,
      newUsers: 4,
      integrationBatches: 8,
      serials: "~130 DEMO-prefixed",
      sapDispatchDocs: 5,
      grns: "4 CLOSED + 1 IN_PROGRESS",
      invoices: 9,
      dispatches: "3 DISPATCHED + 2 IN_PROGRESS + 2 PENDING",
      srns: "3 CLOSED/IN_PROGRESS",
      exceptions: "16 total (6 OPEN, 5 CORRECTED, 5 DISMISSED)",
      ageingBuckets: "B0_30 / B31_60 / B61_90 / B91_PLUS all populated",
      lifecycleSerial: "DEMO-LIFECYCLE-0001 — 7 events",
    }, null, 2));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Demo seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
