import { createdBy } from "./constants.js";
import { q1 } from "./helpers.js";

// ─── 7. Invoices + dispatches ─────────────────────────────────────────────────

export async function seedInvoicesAndDispatches(client, refs, s) {
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
