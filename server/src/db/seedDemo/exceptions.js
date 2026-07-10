import { createdBy } from "./constants.js";
import { q1 } from "./helpers.js";

// ─── 9. Exceptions ────────────────────────────────────────────────────────────

export async function seedExceptions(client, refs, s, grnIds, dispIds, srnIds, _batches) {
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
