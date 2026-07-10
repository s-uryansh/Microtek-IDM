import { createdBy, D3 } from "./constants.js";
import { q1 } from "./helpers.js";

// ─── 5. SAP dispatch docs ─────────────────────────────────────────────────────

export async function seedSapDocs(client, refs, s, batches) {
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

export async function seedGrns(client, refs, s, docs) {
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
