import { createdBy } from "./constants.js";
import { q1, insertEvent } from "./helpers.js";

// ─── 8. SRNs ──────────────────────────────────────────────────────────────────

export async function seedSrns(client, refs, s, dispData) {
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
