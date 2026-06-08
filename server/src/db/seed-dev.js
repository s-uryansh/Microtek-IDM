import pg from "pg";

import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";

const createdBy = "SEED";
const defaultAdminPasswordHash = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";

function assertNonProduction(config) {
  if (config.nodeEnv === "production" || /prod/i.test(config.databaseUrl)) {
    throw new Error("Refusing to run development seed against a production-looking environment");
  }
}

async function upsertOne(client, sql, values) {
  const result = await client.query(sql, values);
  return result.rows[0];
}

async function seedReferences(client) {
  const warehouses = {};
  for (const warehouse of [
    ["PLNT-01", "Demo Plant 01", "PLANT"],
    ["CW-01", "Demo Central Warehouse", "CENTRAL"],
    ["RW-01", "Demo Regional Warehouse 01", "REGIONAL"],
    ["RW-02", "Demo Regional Warehouse 02", "REGIONAL"],
    ["RW-03", "Demo Regional Warehouse 03", "REGIONAL"]
  ]) {
    const row = await upsertOne(
      client,
      `INSERT INTO warehouse (code, name, type, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           type = EXCLUDED.type,
           updated_at = now(),
           updated_by = EXCLUDED.created_by
       RETURNING warehouse_id AS "warehouseId"`,
      [...warehouse, createdBy]
    );
    warehouses[warehouse[0]] = row.warehouseId;
  }

  const products = {};
  for (const product of [
    ["SKU-INV-1", "Demo Inverter 1KVA", "INVERTER", false],
    ["SKU-INV-2", "Demo Inverter 2KVA", "INVERTER", false],
    ["SKU-BAT-1", "Demo Battery 100AH", "BATTERY", true],
    ["SKU-BAT-2", "Demo Battery 150AH", "BATTERY", true]
  ]) {
    const row = await upsertOne(
      client,
      `INSERT INTO product (product_code, name, segment, is_battery, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (product_code) DO UPDATE
       SET name = EXCLUDED.name,
           segment = EXCLUDED.segment,
           is_battery = EXCLUDED.is_battery,
           updated_at = now(),
           updated_by = EXCLUDED.created_by
       RETURNING product_id AS "productId"`,
      [...product, createdBy]
    );
    products[product[0]] = row.productId;
  }

  for (const role of [
    ["admin", "Administrator"],
    ["supervisor", "Supervisor"],
    ["warehouse_operator", "Warehouse Operator"]
  ]) {
    await client.query(
      `INSERT INTO role (code, name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           updated_at = now(),
           updated_by = EXCLUDED.created_by`,
      [...role, createdBy]
    );
  }

  return { warehouses, products };
}

async function seedDefaultAdmin(client, { warehouses }) {
  const admin = await upsertOne(
    client,
    `INSERT INTO app_user (
       external_ref,
       username,
       display_name,
       password_hash,
       role_id,
       is_active,
       created_by
     )
     SELECT 'DEV-ADMIN', 'admin', 'Development Administrator', $1, role_id, TRUE, $2
     FROM role
     WHERE code = 'admin'
     ON CONFLICT (username) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         role_id = EXCLUDED.role_id,
         is_active = TRUE,
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING app_user_id AS "appUserId"`,
    [defaultAdminPasswordHash, createdBy]
  );

  for (const warehouseId of Object.values(warehouses)) {
    await client.query(
      `INSERT INTO app_user_warehouse (app_user_id, warehouse_id, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (app_user_id, warehouse_id) DO NOTHING`,
      [admin.appUserId, warehouseId, createdBy]
    );
  }
}

async function seedSerial(client, { serialNo, productId, status, warehouseId, receivedAt, sourceInvoiceRef }) {
  const row = await upsertOne(
    client,
    `INSERT INTO serial_master (
       serial_no,
       product_id,
       batch_no,
       current_status,
       current_warehouse_id,
       received_at,
       source_invoice_ref,
       created_by
     )
     VALUES ($1, $2, 'DEMO-BATCH', $3, $4, $5, $6, $7)
     ON CONFLICT (serial_no) DO UPDATE
     SET product_id = EXCLUDED.product_id,
         current_status = EXCLUDED.current_status,
         current_warehouse_id = EXCLUDED.current_warehouse_id,
         received_at = EXCLUDED.received_at,
         source_invoice_ref = EXCLUDED.source_invoice_ref,
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING serial_id AS "serialId"`,
    [serialNo, productId, status, warehouseId ?? null, receivedAt ?? null, sourceInvoiceRef ?? null, createdBy]
  );

  return row.serialId;
}

async function appendEventOnce(client, { serialId, eventType, warehouseId, referenceType, referenceId }) {
  const existing = await client.query(
    `SELECT 1
     FROM serial_event
     WHERE serial_id = $1
       AND event_type = $2
       AND COALESCE(reference_type, '') = COALESCE($3, '')
       AND COALESCE(reference_id, 0) = COALESCE($4, 0)
     LIMIT 1`,
    [serialId, eventType, referenceType ?? null, referenceId ?? null]
  );

  if (existing.rowCount > 0) {
    return;
  }

  await client.query(
    `INSERT INTO serial_event (serial_id, event_type, warehouse_id, reference_type, reference_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [serialId, eventType, warehouseId ?? null, referenceType ?? null, referenceId ?? null, createdBy]
  );
}

async function seedProductionAndHistory(client, { warehouses, products }) {
  const serials = {};
  const seedRows = [
    ["DEMO-GRN-0001", "SKU-INV-1", "IN_TRANSIT", warehouses["PLNT-01"], null],
    ["DEMO-GRN-0002", "SKU-INV-1", "IN_TRANSIT", warehouses["PLNT-01"], null],
    ["DEMO-WRONG-0001", "SKU-INV-1", "IN_TRANSIT", warehouses["PLNT-01"], null],
    ["DEMO-EXCESS-0001", "SKU-INV-2", "IN_STOCK", warehouses["RW-01"], "2026-05-15T00:00:00.000Z"],
    ["DEMO-DISP-0001", "SKU-INV-1", "IN_STOCK", warehouses["RW-01"], "2026-04-15T00:00:00.000Z"],
    ["DEMO-DISP-0002", "SKU-INV-1", "IN_STOCK", warehouses["RW-01"], "2026-04-16T00:00:00.000Z"],
    ["DEMO-BAT-0001", "SKU-BAT-1", "IN_STOCK", warehouses["RW-01"], "2026-04-20T00:00:00.000Z"],
    ["DEMO-BAT-0002", "SKU-BAT-1", "IN_STOCK", warehouses["RW-01"], "2026-04-21T00:00:00.000Z"],
    ["DEMO-SRN-0001", "SKU-INV-1", "DISPATCHED", warehouses["RW-01"], "2026-03-15T00:00:00.000Z"],
    ["DEMO-HERO-0001", "SKU-INV-1", "IN_STOCK", warehouses["RW-01"], "2026-02-15T00:00:00.000Z"],
    ["DEMO-AGE-OLD", "SKU-INV-2", "IN_STOCK", warehouses["RW-02"], "2026-01-01T00:00:00.000Z"],
    ["DEMO-AGE-MISSING", "SKU-INV-2", "IN_STOCK", warehouses["RW-02"], null]
  ];

  for (const [serialNo, productCode, status, warehouseId, receivedAt] of seedRows) {
    serials[serialNo] = await seedSerial(client, {
      serialNo,
      productId: products[productCode],
      status,
      warehouseId,
      receivedAt
    });
    await appendEventOnce(client, {
      serialId: serials[serialNo],
      eventType: "PRODUCTION",
      warehouseId: warehouses["PLNT-01"],
      referenceType: "IMPORT",
      referenceId: null
    });
  }

  await appendEventOnce(client, {
    serialId: serials["DEMO-HERO-0001"],
    eventType: "GRN",
    warehouseId: warehouses["RW-01"],
    referenceType: "GRN",
    referenceId: null
  });

  return serials;
}

async function seedDispatchDocs(client, { warehouses, products, serials }) {
  const cleanDoc = await upsertOne(
    client,
    `INSERT INTO sap_dispatch_doc (external_ref, source_warehouse_id, destination_warehouse_id, created_by)
     VALUES ('DEMO-DISP-CW-01', $1, $2, $3)
     ON CONFLICT (external_ref) DO UPDATE
     SET destination_warehouse_id = EXCLUDED.destination_warehouse_id,
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING sap_dispatch_doc_id AS "sapDispatchDocId"`,
    [warehouses["PLNT-01"], warehouses["RW-01"], createdBy]
  );
  const wrongDoc = await upsertOne(
    client,
    `INSERT INTO sap_dispatch_doc (external_ref, source_warehouse_id, destination_warehouse_id, created_by)
     VALUES ('DEMO-DISP-RW-02', $1, $2, $3)
     ON CONFLICT (external_ref) DO UPDATE
     SET destination_warehouse_id = EXCLUDED.destination_warehouse_id,
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING sap_dispatch_doc_id AS "sapDispatchDocId"`,
    [warehouses["PLNT-01"], warehouses["RW-02"], createdBy]
  );

  for (const [docId, serialNo, lineNo] of [
    [cleanDoc.sapDispatchDocId, "DEMO-GRN-0001", 1],
    [cleanDoc.sapDispatchDocId, "DEMO-GRN-0002", 2],
    [wrongDoc.sapDispatchDocId, "DEMO-WRONG-0001", 1]
  ]) {
    await client.query(
      `INSERT INTO sap_dispatch_line (sap_dispatch_doc_id, serial_id, product_id, line_no, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sap_dispatch_doc_id, serial_id) DO NOTHING`,
      [docId, serials[serialNo], products["SKU-INV-1"], lineNo, createdBy]
    );
  }

  return { cleanDocId: cleanDoc.sapDispatchDocId };
}

async function seedInvoicesAndDispatch(client, { warehouses, products, serials }) {
  const invoice = await upsertOne(
    client,
    `INSERT INTO invoice (sap_invoice_ref, warehouse_id, created_by)
     VALUES ('DEMO-INV-001', $1, $2)
     ON CONFLICT (sap_invoice_ref) DO UPDATE
     SET warehouse_id = EXCLUDED.warehouse_id,
         status = 'PENDING',
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING invoice_id AS "invoiceId"`,
    [warehouses["RW-01"], createdBy]
  );
  const invoiceLine = await upsertOne(
    client,
    `INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, sap_suggested_serial_no, created_by)
     VALUES ($1, $2, 1, 2, 'DEMO-DISP-0001', $3)
     ON CONFLICT (invoice_id, line_no) DO UPDATE
     SET product_id = EXCLUDED.product_id,
         required_quantity = EXCLUDED.required_quantity,
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING invoice_line_id AS "invoiceLineId"`,
    [invoice.invoiceId, products["SKU-INV-1"], createdBy]
  );

  const batteryInvoice = await upsertOne(
    client,
    `INSERT INTO invoice (sap_invoice_ref, warehouse_id, created_by)
     VALUES ('DEMO-INV-BATTERY', $1, $2)
     ON CONFLICT (sap_invoice_ref) DO UPDATE
     SET warehouse_id = EXCLUDED.warehouse_id,
         status = 'PENDING',
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING invoice_id AS "invoiceId"`,
    [warehouses["RW-01"], createdBy]
  );
  const batteryLine = await upsertOne(
    client,
    `INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, sap_suggested_serial_no, created_by)
     VALUES ($1, $2, 1, 2, 'DEMO-BAT-0001', $3)
     ON CONFLICT (invoice_id, line_no) DO UPDATE
     SET product_id = EXCLUDED.product_id,
         required_quantity = EXCLUDED.required_quantity,
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING invoice_line_id AS "invoiceLineId"`,
    [batteryInvoice.invoiceId, products["SKU-BAT-1"], createdBy]
  );

  const returnInvoice = await upsertOne(
    client,
    `INSERT INTO invoice (sap_invoice_ref, warehouse_id, status, created_by)
     VALUES ('DEMO-INV-RETURN', $1, 'DISPATCHED', $2)
     ON CONFLICT (sap_invoice_ref) DO UPDATE
     SET warehouse_id = EXCLUDED.warehouse_id,
         status = 'DISPATCHED',
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING invoice_id AS "invoiceId"`,
    [warehouses["RW-01"], createdBy]
  );
  const returnLine = await upsertOne(
    client,
    `INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
     VALUES ($1, $2, 1, 1, $3)
     ON CONFLICT (invoice_id, line_no) DO UPDATE
     SET product_id = EXCLUDED.product_id,
         required_quantity = EXCLUDED.required_quantity,
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING invoice_line_id AS "invoiceLineId"`,
    [returnInvoice.invoiceId, products["SKU-INV-1"], createdBy]
  );
  const dispatch = await upsertOne(
    client,
    `INSERT INTO dispatch (invoice_id, warehouse_id, status, created_by)
     VALUES ($1, $2, 'DISPATCHED', $3)
     ON CONFLICT (invoice_id) DO UPDATE
     SET status = 'DISPATCHED',
         updated_at = now(),
         updated_by = EXCLUDED.created_by
     RETURNING dispatch_id AS "dispatchId"`,
    [returnInvoice.invoiceId, warehouses["RW-01"], createdBy]
  );
  await client.query(
    `INSERT INTO dispatch_scan (dispatch_id, invoice_line_id, serial_id, scanned_by, created_by)
     VALUES ($1, $2, $3, 'seed_operator', $4)
     ON CONFLICT DO NOTHING`,
    [dispatch.dispatchId, returnLine.invoiceLineId, serials["DEMO-SRN-0001"], createdBy]
  );
  await appendEventOnce(client, {
    serialId: serials["DEMO-SRN-0001"],
    eventType: "CUSTOMER_DISPATCH",
    warehouseId: warehouses["RW-01"],
    referenceType: "DISPATCH",
    referenceId: dispatch.dispatchId
  });

  return {
    invoiceId: invoice.invoiceId,
    invoiceLineId: invoiceLine.invoiceLineId,
    batteryInvoiceId: batteryInvoice.invoiceId,
    batteryInvoiceLineId: batteryLine.invoiceLineId,
    returnInvoiceId: returnInvoice.invoiceId,
    returnInvoiceLineId: returnLine.invoiceLineId,
    returnDispatchId: dispatch.dispatchId
  };
}

async function seedReportsAndExceptions(client, { warehouses, products, serials }) {
  const run = await upsertOne(
    client,
    `INSERT INTO opening_stock_reconciliation_run (warehouse_id, source_ref, status, created_by)
     VALUES ($1, 'DEMO-OPENING-STOCK', 'CALCULATED', $2)
     RETURNING reconciliation_run_id AS "runId"`,
    [warehouses["RW-01"], createdBy]
  );
  await client.query(
    `INSERT INTO opening_stock_reconciliation_line (
       reconciliation_run_id,
       product_id,
       sap_quantity,
       idm_quantity,
       variance_quantity,
       created_by
     )
     VALUES ($1, $2, 10, 9, -1, $3)
     ON CONFLICT (reconciliation_run_id, product_id) DO NOTHING`,
    [run.runId, products["SKU-INV-1"], createdBy]
  );
  await client.query(
    `INSERT INTO exception_log (
       serial_no,
       rule_code,
       context_type,
       context_id,
       status,
       raised_by,
       created_by,
       corrected_at,
       corrected_by,
       correction_reason,
       correction_txn_ref
     )
     VALUES ('DEMO-HERO-0001', 'WRONG_SERIAL', 'GRN', NULL, 'CORRECTED', 'seed_operator', $1, now(), 'seed_supervisor', 'Demo correction-ready history row', 'DEMO-CORR-001')`,
    [createdBy]
  );
  const openException = await upsertOne(
    client,
    `INSERT INTO exception_log (
       serial_no,
       rule_code,
       context_type,
       context_id,
       status,
       raised_by,
       created_by
     )
     VALUES ('DEMO-DISP-0002', 'PRODUCT_INVOICE_MISMATCH', 'DISPATCH', NULL, 'OPEN', 'seed_operator', $1)
     RETURNING exception_id AS "exceptionId"`,
    [createdBy]
  );
  await appendEventOnce(client, {
    serialId: serials["DEMO-HERO-0001"],
    eventType: "CORRECTION",
    warehouseId: warehouses["RW-01"],
    referenceType: "EXCEPTION",
    referenceId: null
  });

  return { openExceptionId: openException.exceptionId };
}

async function refreshAgeingSnapshot(client) {
  await client.query("REFRESH MATERIALIZED VIEW ageing_serial_snapshot");
}

async function seed(client) {
  await teardown(client);
  const refs = await seedReferences(client);
  await seedDefaultAdmin(client, refs);
  const serials = await seedProductionAndHistory(client, refs);
  const dispatchDocs = await seedDispatchDocs(client, { ...refs, serials });
  const invoice = await seedInvoicesAndDispatch(client, { ...refs, serials });
  const reports = await seedReportsAndExceptions(client, { ...refs, serials });
  await refreshAgeingSnapshot(client);

  return {
    warehouses: refs.warehouses,
    products: refs.products,
    serials,
    cleanSapDispatchDocId: dispatchDocs.cleanDocId,
    dispatchInvoiceId: invoice.invoiceId,
    dispatchInvoiceLineId: invoice.invoiceLineId,
    batteryInvoiceId: invoice.batteryInvoiceId,
    batteryInvoiceLineId: invoice.batteryInvoiceLineId,
    returnInvoiceId: invoice.returnInvoiceId,
    returnInvoiceLineId: invoice.returnInvoiceLineId,
    returnDispatchId: invoice.returnDispatchId,
    openExceptionId: reports.openExceptionId,
    admin: {
      username: "admin",
      password: "admin123"
    }
  };
}

async function teardown(client) {
  await client.query("DELETE FROM exception_log WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM serial_event WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM opening_stock_reconciliation_line WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM opening_stock_reconciliation_run WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM srn_scan WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM srn WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM grn_scan WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM grn WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM dispatch_scan WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM dispatch WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM invoice_line WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM invoice WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM sap_dispatch_line WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM sap_dispatch_doc WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM serial_master WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM app_user_warehouse WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM app_user WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM role_permission WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM role WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM product WHERE created_by = $1", [createdBy]);
  await client.query("DELETE FROM warehouse WHERE created_by = $1", [createdBy]);
  await refreshAgeingSnapshot(client);
}

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  assertNonProduction(config);

  const client = new pg.Client({ connectionString: config.databaseUrl });
  const command = process.argv[2] ?? "seed";
  await client.connect();

  try {
    await client.query("BEGIN");
    if (command === "teardown") {
      await teardown(client);
      await client.query("COMMIT");
      logger.info("Development seed data removed");
      return;
    }

    const summary = await seed(client);
    await client.query("COMMIT");
    logger.info({ summary }, "Development seed data ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
