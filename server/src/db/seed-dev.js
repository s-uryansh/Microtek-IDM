import pg from "pg";

import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";

const createdBy = "SEED";
const defaultAdminPasswordHash = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";
const defaultSupervisorPasswordHash = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";
const defaultOperatorPasswordHash = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";

function assertNonProduction(config) {
  if (config.nodeEnv === "production" || /prod/i.test(config.databaseUrl)) {
    throw new Error("Refusing to run development seed against a production-looking environment");
  }
}

async function upsertOne(client, sql, values) {
  const result = await client.query(sql, values);
  return result.rows[0];
}

/* ============================================================
   WAREHOUSES, PRODUCTS, ROLES
   ============================================================ */

async function seedReferences(client) {
  const warehouses = {};
  for (const wh of [
    ["PLNT-01", "Microtek Plant 01", "PLANT"],
    ["CW-01", "Microtek Central Warehouse", "CENTRAL"],
    ["RW-01", "Microtek Regional Warehouse 01", "REGIONAL"],
    ["RW-02", "Microtek Regional Warehouse 02", "REGIONAL"],
    ["RW-03", "Microtek Regional Warehouse 03", "REGIONAL"]
  ]) {
    const row = await upsertOne(client, `
      INSERT INTO warehouse (code, name, type, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name, type = EXCLUDED.type,
          updated_at = now(), updated_by = EXCLUDED.created_by
      RETURNING warehouse_id AS "warehouseId"`,
      [...wh, createdBy]
    );
    warehouses[wh[0]] = row.warehouseId;
  }

  /* Products with categories:
     INVERTER  → MTK-INVERTER-1KVA, MTK-INVERTER-2KVA
     BATTERY   → MTK-BATTERY-100AH, MTK-BATTERY-150AH
     SOLAR     → MTK-SOLAR-300W, MTK-SOLAR-500W
     ACCESSORY → MTK-CHARGE-CONTROLLER
  */
  const products = {};
  for (const prod of [
    ["MTK-INVERTER-1KVA",  "Microtek Inverter 1KVA",     "INVERTER",  false, "INVERTER"],
    ["MTK-INVERTER-2KVA",  "Microtek Inverter 2KVA",     "INVERTER",  false, "INVERTER"],
    ["MTK-BATTERY-100AH",  "Microtek Battery 100AH",     "BATTERY",   true,  "BATTERY"],
    ["MTK-BATTERY-150AH",  "Microtek Battery 150AH",     "BATTERY",   true,  "BATTERY"],
    ["MTK-SOLAR-300W",  "Microtek Solar Panel 300W",  "SOLAR",     false, "SOLAR"],
    ["MTK-SOLAR-500W",  "Microtek Solar Panel 500W",  "SOLAR",     false, "SOLAR"],
    ["MTK-CHARGE-CONTROLLER",  "Microtek Charge Controller", "ACCESSORY", false, "ACCESSORY"]
  ]) {
    const row = await upsertOne(client, `
      INSERT INTO product (product_code, name, segment, is_battery, category, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (product_code) DO UPDATE
      SET name = EXCLUDED.name, segment = EXCLUDED.segment,
          is_battery = EXCLUDED.is_battery, category = EXCLUDED.category,
          updated_at = now(), updated_by = EXCLUDED.created_by
      RETURNING product_id AS "productId"`,
      [...prod, createdBy]
    );
    products[prod[0]] = row.productId;
  }

  for (const role of [
    ["admin", "Administrator"],
    ["supervisor", "Supervisor"],
    ["warehouse_operator", "Warehouse Operator"]
  ]) {
    await client.query(`
      INSERT INTO role (code, name, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name, updated_at = now(), updated_by = EXCLUDED.created_by`,
      [...role, createdBy]
    );
  }

  return { warehouses, products };
}

async function seedRolePermissions(client) {
  const rolePermissions = {
    admin: [
      "foundation:read",
      "integration:import",
      "serial:validate",
      "dispatch:write",
      "grn:write",
      "srn:write",
      "fulfilment:read",
      "ageing:read",
      "reconciliation:read",
      "serial-history:read",
      "exception:read",
      "exception:correct",
      "battery:write",
      "battery:read",
      "admin:access"
    ],
    supervisor: [
      "foundation:read",
      "serial:validate",
      "dispatch:write",
      "grn:write",
      "srn:write",
      "fulfilment:read",
      "ageing:read",
      "reconciliation:read",
      "serial-history:read",
      "exception:read",
      "exception:correct",
      "battery:write",
      "battery:read"
    ],
    warehouse_operator: [
      "foundation:read",
      "serial:validate",
      "dispatch:write",
      "grn:write",
      "srn:write",
      "fulfilment:read",
      "exception:read",
      "battery:write",
      "battery:read"
    ]
  };

  for (const [roleCode, permissions] of Object.entries(rolePermissions)) {
    const roleResult = await client.query(
      `SELECT role_id AS "roleId" FROM role WHERE code = $1`,
      [roleCode]
    );
    const roleId = roleResult.rows[0]?.roleId;
    if (!roleId) {
      continue;
    }

    await client.query(`DELETE FROM role_permission WHERE role_id = $1`, [roleId]);
    for (const permissionCode of permissions) {
      await client.query(
        `
        INSERT INTO role_permission (role_id, permission_code, created_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (role_id, permission_code) DO NOTHING`,
        [roleId, permissionCode, createdBy]
      );
    }
  }
}

async function seedDefaultAdmin(client, { warehouses }) {
  const admin = await upsertOne(client, `
    INSERT INTO app_user (
      external_ref, username, display_name, password_hash, role_id, is_active, created_by
    )
    SELECT 'DEV-ADMIN', 'admin', 'Development Administrator', $1, role_id, TRUE, $2
    FROM role WHERE code = 'admin'
    ON CONFLICT (username) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, role_id = EXCLUDED.role_id,
        is_active = TRUE, updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING app_user_id AS "appUserId"`,
    [defaultAdminPasswordHash, createdBy]
  );

  for (const warehouseId of Object.values(warehouses)) {
    await client.query(`
      INSERT INTO app_user_warehouse (app_user_id, warehouse_id, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (app_user_id, warehouse_id) DO NOTHING`,
      [admin.appUserId, warehouseId, createdBy]
    );
  }
}

async function seedStaffUsers(client, { warehouses }) {
  const staffUsers = [
    {
      externalRef: "DEV-SUPERVISOR-1",
      username: "supervisor_1",
      displayName: "Development Supervisor",
      passwordHash: defaultSupervisorPasswordHash,
      roleCode: "supervisor",
      defaultWarehouseId: warehouses["RW-01"],
      warehouseIds: [warehouses["RW-01"]]
    },
    {
      externalRef: "DEV-OPERATOR-1",
      username: "operator_1",
      displayName: "Development Operator",
      passwordHash: defaultOperatorPasswordHash,
      roleCode: "warehouse_operator",
      defaultWarehouseId: warehouses["RW-02"],
      warehouseIds: [warehouses["RW-02"]]
    }
  ];

  const created = {};
  for (const staff of staffUsers) {
    const result = await upsertOne(client, `
      INSERT INTO app_user (
        external_ref, username, display_name, password_hash, role_id, default_warehouse_id, is_active, created_by
      )
      SELECT $1, $2, $3, $4, role_id, $5, TRUE, $6
      FROM role WHERE code = $7
      ON CONFLICT (username) DO UPDATE
      SET external_ref = EXCLUDED.external_ref,
          display_name = EXCLUDED.display_name,
          password_hash = EXCLUDED.password_hash,
          role_id = EXCLUDED.role_id,
          default_warehouse_id = EXCLUDED.default_warehouse_id,
          is_active = TRUE,
          updated_at = now(),
          updated_by = EXCLUDED.created_by
      RETURNING app_user_id AS "appUserId"`,
      [staff.externalRef, staff.username, staff.displayName, staff.passwordHash, staff.defaultWarehouseId, createdBy, staff.roleCode]
    );

    await client.query(
      `DELETE FROM app_user_warehouse WHERE app_user_id = $1`,
      [result.appUserId]
    );
    for (const warehouseId of staff.warehouseIds) {
      await client.query(`
        INSERT INTO app_user_warehouse (app_user_id, warehouse_id, created_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (app_user_id, warehouse_id) DO NOTHING`,
        [result.appUserId, warehouseId, createdBy]
      );
    }
    created[staff.username] = { username: staff.username, password: "admin123" };
  }

  return created;
}

/* ============================================================
   SERIALS — broad Microtek stock across products & statuses
   ============================================================ */

async function seedSerial(client, { serialNo, productId, status, warehouseId, receivedAt, sourceInvoiceRef }) {
  const row = await upsertOne(client, `
    INSERT INTO serial_master (
      serial_no, product_id, batch_no, current_status, current_warehouse_id,
      received_at, source_invoice_ref, created_by
    )
    VALUES ($1, $2, 'MTK-APR2026-BATCH', $3, $4, $5, $6, $7)
    ON CONFLICT (serial_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, current_status = EXCLUDED.current_status,
        current_warehouse_id = EXCLUDED.current_warehouse_id,
        received_at = EXCLUDED.received_at,
        source_invoice_ref = EXCLUDED.source_invoice_ref,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING serial_id AS "serialId"`,
    [serialNo, productId, status, warehouseId ?? null, receivedAt ?? null, sourceInvoiceRef ?? null, createdBy]
  );
  return row.serialId;
}

async function appendEventOnce(client, { serialId, eventType, warehouseId, referenceType, referenceId }) {
  const existing = await client.query(`
    SELECT 1 FROM serial_event
    WHERE serial_id = $1 AND event_type = $2
      AND COALESCE(reference_type, '') = COALESCE($3, '')
      AND COALESCE(reference_id, 0) = COALESCE($4, 0)
    LIMIT 1`,
    [serialId, eventType, referenceType ?? null, referenceId ?? null]
  );
  if (existing.rowCount > 0) return;

  await client.query(`
    INSERT INTO serial_event (serial_id, event_type, warehouse_id, reference_type, reference_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)`,
    [serialId, eventType, warehouseId ?? null, referenceType ?? null, referenceId ?? null, createdBy]
  );
}

async function seedProductionAndHistory(client, { warehouses, products }) {
  const serials = {};
  const seedRows = [
    /* GRN test serials (IN_TRANSIT at PLNT-01) */
    ["MTK-INTRANSIT-0001",  "MTK-INVERTER-1KVA", "IN_TRANSIT", warehouses["PLNT-01"], null],
    ["MTK-INTRANSIT-0002",  "MTK-INVERTER-1KVA", "IN_TRANSIT", warehouses["PLNT-01"], null],
    ["MTK-INTRANSIT-RW02-0001","MTK-INVERTER-1KVA", "IN_TRANSIT", warehouses["PLNT-01"], null],

    /* Excess / edge-case */
    ["MTK-EXCESS-0001","MTK-INVERTER-2KVA", "IN_STOCK",   warehouses["RW-01"], "2026-05-15T00:00:00.000Z"],

    /* Dispatch test serials (IN_STOCK at RW-01) */
    ["MTK-INV1K-0001", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-15T00:00:00.000Z"],
    ["MTK-INV1K-0002", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-16T00:00:00.000Z"],
    ["MTK-INV1K-0003", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-17T00:00:00.000Z"],
    ["MTK-INV1K-0004", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-18T00:00:00.000Z"],
    ["MTK-INV1K-0005", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-19T00:00:00.000Z"],
    ["MTK-INV1K-0006", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-20T00:00:00.000Z"],
    ["MTK-INV1K-0007", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-21T00:00:00.000Z"],
    ["MTK-INV1K-0008", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-22T00:00:00.000Z"],
    ["MTK-INV1K-0009", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-23T00:00:00.000Z"],
    ["MTK-INV1K-0010", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-24T00:00:00.000Z"],

    /* Battery serials (IN_STOCK at RW-01) */
    ["MTK-BAT100-0001",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-20T00:00:00.000Z"],
    ["MTK-BAT100-0002",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-21T00:00:00.000Z"],
    ["MTK-BAT100-0003",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-22T00:00:00.000Z"],
    ["MTK-BAT100-0004",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-23T00:00:00.000Z"],
    ["MTK-BAT100-0005",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-24T00:00:00.000Z"],
    ["MTK-BAT100-0006",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-25T00:00:00.000Z"],
    ["MTK-BAT100-0007",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-26T00:00:00.000Z"],
    ["MTK-BAT100-0008",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-27T00:00:00.000Z"],
    ["MTK-BAT100-0009",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-28T00:00:00.000Z"],
    ["MTK-BAT100-0010",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-29T00:00:00.000Z"],

    /* SRN serial (dispatched) */
    ["MTK-RET-0001",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-15T00:00:00.000Z"],
    ["MTK-RET-0002",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-16T00:00:00.000Z"],
    ["MTK-RET-0003",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-17T00:00:00.000Z"],
    ["MTK-RET-0004",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-18T00:00:00.000Z"],
    ["MTK-RET-0005",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-19T00:00:00.000Z"],
    ["MTK-RET-0006",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-20T00:00:00.000Z"],
    ["MTK-RET-0007",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-21T00:00:00.000Z"],
    ["MTK-RET-0008",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-22T00:00:00.000Z"],
    ["MTK-RET-0009",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-23T00:00:00.000Z"],
    ["MTK-RET-0010",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-24T00:00:00.000Z"],

    /* Lifecycle serial */
    ["MTK-LIFECYCLE-0001", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-02-15T00:00:00.000Z"],

    /* Ageing serials */
    ["MTK-INV2K-0001",   "MTK-INVERTER-2KVA", "IN_STOCK",   warehouses["RW-02"], "2026-01-01T00:00:00.000Z"],
    ["MTK-INV2K-0002","MTK-INVERTER-2KVA","IN_STOCK",   warehouses["RW-02"], null],

    /* New products: solar & accessory serials */
    ["MTK-SOL300-0001",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["MTK-SOL300-0002",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["MTK-SOL300-0003",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["MTK-SOL300-0004",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["MTK-SOL300-0005",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["MTK-SOL300-0006",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["MTK-SOL300-0007",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["MTK-SOL300-0008",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-08T00:00:00.000Z"],
    ["MTK-SOL300-0009",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["MTK-SOL300-0010",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["MTK-SOL500-0001", "MTK-SOLAR-500W", "IN_STOCK",   warehouses["RW-02"], "2026-04-10T00:00:00.000Z"],
    ["MTK-INV2K-0003", "MTK-INVERTER-2KVA", "IN_STOCK",   warehouses["RW-02"], "2026-04-11T00:00:00.000Z"],
    ["MTK-SOL500-0002", "MTK-SOLAR-500W", "IN_STOCK",   warehouses["RW-02"], "2026-04-12T00:00:00.000Z"],
    ["MTK-ACCCHG-0001",  "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-20T00:00:00.000Z"],
    ["MTK-ACCCHG-0002",  "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-21T00:00:00.000Z"],
    ["MTK-ACCCHG-0006", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-22T00:00:00.000Z"],
    ["MTK-ACCCHG-0007", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-23T00:00:00.000Z"],
    ["MTK-ACCCHG-0008", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-24T00:00:00.000Z"],
    ["MTK-ACCCHG-0009", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-25T00:00:00.000Z"],
    ["MTK-ACCCHG-0010", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-26T00:00:00.000Z"]
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
    serialId: serials["MTK-LIFECYCLE-0001"],
    eventType: "GRN",
    warehouseId: warehouses["RW-01"],
    referenceType: "GRN",
    referenceId: null
  });

  return serials;
}

/* ============================================================
   SAP DISPATCH DOCS
   ============================================================ */

async function seedDispatchDocs(client, { warehouses, products, serials }) {
  const cleanDoc = await upsertOne(client, `
    INSERT INTO sap_dispatch_doc (external_ref, source_warehouse_id, destination_warehouse_id, created_by)
    VALUES ('MTK-DISPATCH-CW-01', $1, $2, $3)
    ON CONFLICT (external_ref) DO UPDATE
    SET destination_warehouse_id = EXCLUDED.destination_warehouse_id,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING sap_dispatch_doc_id AS "sapDispatchDocId"`,
    [warehouses["PLNT-01"], warehouses["RW-01"], createdBy]
  );
  const wrongDoc = await upsertOne(client, `
    INSERT INTO sap_dispatch_doc (external_ref, source_warehouse_id, destination_warehouse_id, created_by)
    VALUES ('MTK-DISPATCH-RW02-01', $1, $2, $3)
    ON CONFLICT (external_ref) DO UPDATE
    SET destination_warehouse_id = EXCLUDED.destination_warehouse_id,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING sap_dispatch_doc_id AS "sapDispatchDocId"`,
    [warehouses["PLNT-01"], warehouses["RW-02"], createdBy]
  );

  for (const [docId, serialNo, lineNo] of [
    [cleanDoc.sapDispatchDocId, "MTK-INTRANSIT-0001", 1],
    [cleanDoc.sapDispatchDocId, "MTK-INTRANSIT-0002", 2],
    [wrongDoc.sapDispatchDocId, "MTK-INTRANSIT-RW02-0001", 1]
  ]) {
    await client.query(`
      INSERT INTO sap_dispatch_line (sap_dispatch_doc_id, serial_id, product_id, line_no, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (sap_dispatch_doc_id, serial_id) DO NOTHING`,
      [docId, serials[serialNo], products["MTK-INVERTER-1KVA"], lineNo, createdBy]
    );
  }

  return { cleanDocId: cleanDoc.sapDispatchDocId };
}

/* ============================================================
   INVOICES — now with MULTIPLE product lines per invoice
   ============================================================ */

async function seedInvoicesAndDispatch(client, { warehouses, products, serials }) {
  /* ── Invoice 1: MTK-INVOICE-RW01-001 → RW-01, multi-product ── */
  const invoice1 = await upsertOne(client, `
    INSERT INTO invoice (sap_invoice_ref, warehouse_id, created_by)
    VALUES ('MTK-INVOICE-RW01-001', $1, $2)
    ON CONFLICT (sap_invoice_ref) DO UPDATE
    SET warehouse_id = EXCLUDED.warehouse_id, status = 'PENDING',
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_id AS "invoiceId"`,
    [warehouses["RW-01"], createdBy]
  );
  /* INV-001 lines: 5x Microtek Inverter 1KVA, 5x Microtek Solar Panel 300W */
  const inv1Line1 = await upsertOne(client, `
    INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
    VALUES ($1, $2, 1, 5, $3)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [invoice1.invoiceId, products["MTK-INVERTER-1KVA"], createdBy]
  );
  const inv1Line2 = await upsertOne(client, `
    INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
    VALUES ($1, $2, 2, 5, $3)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [invoice1.invoiceId, products["MTK-SOLAR-300W"], createdBy]
  );

  /* ── Invoice 2: MTK-INVOICE-BATTERY-001 → RW-01, battery-only ── */
  const batteryInvoice = await upsertOne(client, `
    INSERT INTO invoice (sap_invoice_ref, warehouse_id, created_by)
    VALUES ('MTK-INVOICE-BATTERY-001', $1, $2)
    ON CONFLICT (sap_invoice_ref) DO UPDATE
    SET warehouse_id = EXCLUDED.warehouse_id, status = 'PENDING',
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_id AS "invoiceId"`,
    [warehouses["RW-01"], createdBy]
  );
  const batteryLine = await upsertOne(client, `
    INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
    VALUES ($1, $2, 1, 10, $3)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [batteryInvoice.invoiceId, products["MTK-BATTERY-100AH"], createdBy]
  );

  /* ── Invoice 3: MTK-INVOICE-RETURN-001 → RW-01, dispatched (for SRN tests) ── */
  const returnInvoice = await upsertOne(client, `
    INSERT INTO invoice (sap_invoice_ref, warehouse_id, status, created_by)
    VALUES ('MTK-INVOICE-RETURN-001', $1, 'DISPATCHED', $2)
    ON CONFLICT (sap_invoice_ref) DO UPDATE
    SET warehouse_id = EXCLUDED.warehouse_id, status = 'DISPATCHED',
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_id AS "invoiceId"`,
    [warehouses["RW-01"], createdBy]
  );
  const returnLine = await upsertOne(client, `
    INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
    VALUES ($1, $2, 1, 10, $3)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [returnInvoice.invoiceId, products["MTK-INVERTER-1KVA"], createdBy]
  );

  /* Create a dispatched dispatch + scan for the return invoice */
  const dispatch = await upsertOne(client, `
    INSERT INTO dispatch (invoice_id, warehouse_id, status, created_by)
    VALUES ($1, $2, 'DISPATCHED', $3)
    ON CONFLICT (invoice_id) DO UPDATE
    SET status = 'DISPATCHED', updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING dispatch_id AS "dispatchId"`,
    [returnInvoice.invoiceId, warehouses["RW-01"], createdBy]
  );
  for (const serialNo of [
    "MTK-RET-0001",
    "MTK-RET-0002",
    "MTK-RET-0003",
    "MTK-RET-0004",
    "MTK-RET-0005",
    "MTK-RET-0006",
    "MTK-RET-0007",
    "MTK-RET-0008",
    "MTK-RET-0009",
    "MTK-RET-0010"
  ]) {
    await client.query(`
      INSERT INTO dispatch_scan (dispatch_id, invoice_line_id, serial_id, scanned_by, created_by)
      VALUES ($1, $2, $3, 'seed_operator', $4)
      ON CONFLICT DO NOTHING`,
      [dispatch.dispatchId, returnLine.invoiceLineId, serials[serialNo], createdBy]
    );
    await appendEventOnce(client, {
      serialId: serials[serialNo],
      eventType: "CUSTOMER_DISPATCH",
      warehouseId: warehouses["RW-01"],
      referenceType: "DISPATCH",
      referenceId: dispatch.dispatchId
    });
  }

  /* ── Invoice 4: MTK-INVOICE-RW02-001 → RW-02, multi-product ── */
  const invoice2 = await upsertOne(client, `
    INSERT INTO invoice (sap_invoice_ref, warehouse_id, created_by)
    VALUES ('MTK-INVOICE-RW02-001', $1, $2)
    ON CONFLICT (sap_invoice_ref) DO UPDATE
    SET warehouse_id = EXCLUDED.warehouse_id, status = 'PENDING',
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_id AS "invoiceId"`,
    [warehouses["RW-02"], createdBy]
  );
  /* INV-002 lines: 3x Microtek Inverter 2KVA, 2x Microtek Solar Panel 500W, 5x Microtek Charge Controller */
  const inv2Line1 = await upsertOne(client, `
    INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
    VALUES ($1, $2, 1, 3, $3)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [invoice2.invoiceId, products["MTK-INVERTER-2KVA"], createdBy]
  );
  const inv2Line2 = await upsertOne(client, `
    INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
    VALUES ($1, $2, 2, 2, $3)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [invoice2.invoiceId, products["MTK-SOLAR-500W"], createdBy]
  );
  const inv2Line3 = await upsertOne(client, `
    INSERT INTO invoice_line (invoice_id, product_id, line_no, required_quantity, created_by)
    VALUES ($1, $2, 3, 5, $3)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [invoice2.invoiceId, products["MTK-CHARGE-CONTROLLER"], createdBy]
  );

  return {
    invoiceId: invoice1.invoiceId,
    invoiceLineId: inv1Line1.invoiceLineId,
    inv1Line2Id: inv1Line2.invoiceLineId,
    batteryInvoiceId: batteryInvoice.invoiceId,
    batteryInvoiceLineId: batteryLine.invoiceLineId,
    returnInvoiceId: returnInvoice.invoiceId,
    returnInvoiceLineId: returnLine.invoiceLineId,
    returnDispatchId: dispatch.dispatchId,
    invoice2Id: invoice2.invoiceId,
    inv2Line1Id: inv2Line1.invoiceLineId,
    inv2Line2Id: inv2Line2.invoiceLineId,
    inv2Line3Id: inv2Line3.invoiceLineId
  };
}

/* ============================================================
   REPORTS & EXCEPTIONS
   ============================================================ */

async function seedReportsAndExceptions(client, { warehouses, products, serials }) {
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

/* ============================================================
   REFRESH MATERIALIZED VIEW
   ============================================================ */

async function refreshAgeingSnapshot(client) {
  await client.query("REFRESH MATERIALIZED VIEW ageing_serial_snapshot");
}

/* ============================================================
   MAIN SEED
   ============================================================ */

async function seed(client) {
  await teardown(client);
  const refs = await seedReferences(client);
  await seedRolePermissions(client);
  await seedDefaultAdmin(client, refs);
  const staff = await seedStaffUsers(client, refs);
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
    inv1Line2Id: invoice.inv1Line2Id,
    batteryInvoiceId: invoice.batteryInvoiceId,
    batteryInvoiceLineId: invoice.batteryInvoiceLineId,
    returnInvoiceId: invoice.returnInvoiceId,
    returnInvoiceLineId: invoice.returnInvoiceLineId,
    returnDispatchId: invoice.returnDispatchId,
    invoice2Id: invoice.invoice2Id,
    inv2Line1Id: invoice.inv2Line1Id,
    inv2Line2Id: invoice.inv2Line2Id,
    inv2Line3Id: invoice.inv2Line3Id,
    openExceptionId: reports.openExceptionId,
    openException2Id: reports.openException2Id,
    admin: {
      username: "admin",
      password: "admin123"
    },
    staff
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
