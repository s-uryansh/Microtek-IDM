import { createdBy, refreshAgeingSnapshot } from "./constants.js";

export async function teardown(client) {
  await client.query("DELETE FROM exception_log WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM serial_event WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM opening_stock_reconciliation_line WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM opening_stock_reconciliation_run WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM srn_scan WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM srn WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM grn_scan WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM grn WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM dispatch_scan WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM dispatch_line WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM dispatch WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM invoice_line WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM invoice WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM sap_dispatch_line WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM sap_dispatch_doc WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM serial_master WHERE created_by = $1", [createdBy]);
  await client.query(
    `DELETE FROM auth_session
     WHERE app_user_id IN (
       SELECT app_user_id FROM app_user WHERE created_by = $1
     )`,
    [createdBy]
  );
  await client.query("DELETE FROM app_user_warehouse WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM app_user WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM role_permission WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM role WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM product WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM warehouse WHERE created_by = $1", [createdBy]);
  await refreshAgeingSnapshot(client);
}
