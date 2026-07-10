import { createdBy } from "./constants.js";

// ─── teardown ────────────────────────────────────────────────────────────────

export async function teardown(client) {
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
