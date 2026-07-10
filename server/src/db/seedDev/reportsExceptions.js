import { createdBy, upsertOne } from "./constants.js";
import { appendEventOnce } from "./serials.js";

export async function seedReportsAndExceptions(client, { warehouses, products, serials }) {
  const run = await upsertOne(client, `
    INSERT INTO opening_stock_reconciliation_run (warehouse_id, source_ref, status, created_by)
    VALUES ($1, 'MTK-OPENING-STOCK-2026', 'CALCULATED', $2)
    RETURNING reconciliation_run_id AS "runId"`,
    [warehouses["RW-01"], createdBy]
  );
  await client.query(`
    INSERT INTO opening_stock_reconciliation_line (
      reconciliation_run_id, product_id, sap_quantity, idm_quantity, variance_quantity, created_by
    )
    VALUES ($1, $2, 10, 9, -1, $3)
    ON CONFLICT (reconciliation_run_id, product_id) DO NOTHING`,
    [run.runId, products["MTK-INVERTER-1KVA"], createdBy]
  );

  /* Corrected exception for MTK-LIFECYCLE-0001 */
  await client.query(`
    INSERT INTO exception_log (
      serial_no, rule_code, context_type, context_id, status,
      raised_by, created_by, corrected_at, corrected_by, correction_reason, correction_txn_ref
    )
    VALUES (
      'MTK-LIFECYCLE-0001', 'WRONG_SERIAL', 'GRN', NULL, 'CORRECTED',
      'seed_operator', $1, now(), 'seed_supervisor',
      'Microtek correction-ready history row', 'MTK-CORR-001'
    )`,
    [createdBy]
  );

  /* Open exception for MTK-INV1K-0002 */
  const openException = await upsertOne(client, `
    INSERT INTO exception_log (
      serial_no, rule_code, context_type, context_id, status, raised_by, created_by
    )
    VALUES ('MTK-INV1K-0002', 'PRODUCT_INVOICE_MISMATCH', 'DISPATCH', NULL, 'OPEN', 'seed_operator', $1)
    RETURNING exception_id AS "exceptionId"`,
    [createdBy]
  );

  /* Open exception for MTK-SOL300-0001 (try to dispatch solar serial on inverter invoice) */
  const openException2 = await upsertOne(client, `
    INSERT INTO exception_log (
      serial_no, rule_code, context_type, context_id, status, raised_by, created_by
    )
    VALUES ('MTK-SOL300-0001', 'PRODUCT_INVOICE_MISMATCH', 'DISPATCH', NULL, 'OPEN', 'seed_operator', $1)
    RETURNING exception_id AS "exceptionId"`,
    [createdBy]
  );

  await appendEventOnce(client, {
    serialId: serials["MTK-LIFECYCLE-0001"],
    eventType: "CORRECTION",
    warehouseId: warehouses["RW-01"],
    referenceType: "EXCEPTION",
    referenceId: null
  });

  return {
    openExceptionId: openException.exceptionId,
    openException2Id: openException2.exceptionId
  };
}
