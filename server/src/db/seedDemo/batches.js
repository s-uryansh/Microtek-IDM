import { createdBy } from "./constants.js";
import { q1 } from "./helpers.js";

// ─── 3. Integration batches ───────────────────────────────────────────────────

export async function seedBatches(client) {
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
