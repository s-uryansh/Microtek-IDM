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

  const products = {};
  // [code, name, segment, is_battery, category, sub_category, product_category,
  //  distributor_price, warranty, gst, mrp, base_price, sbu, poll, moq, description]
  // sub_category/product_category mirror category for now (placeholder pending the
  // client's real category taxonomy); stock is left NULL (see product-data plan).
  for (const prod of [
    ["MTK-INVERTER-1KVA", "Microtek Inverter 1KVA", "INVERTER", false, "INVERTER", "INVERTER", "INVERTER", 8000, "24 months", 18, 12000, 7000, "SBU01", "1", 5, "Microtek Inverter 1KVA"],
    ["MTK-INVERTER-2KVA", "Microtek Inverter 2KVA", "INVERTER", false, "INVERTER", "INVERTER", "INVERTER", 14000, "24 months", 18, 20000, 12000, "SBU01", "1", 5, "Microtek Inverter 2KVA"],
    ["MTK-BATTERY-100AH", "Microtek Battery 100AH", "BATTERY", true, "BATTERY", "BATTERY", "BATTERY", 6000, "36 months", 18, 9500, 5200, "SBU02", "2", 10, "Microtek Battery 100AH"],
    ["MTK-BATTERY-150AH", "Microtek Battery 150AH", "BATTERY", true, "BATTERY", "BATTERY", "BATTERY", 8500, "36 months", 18, 13500, 7400, "SBU02", "2", 10, "Microtek Battery 150AH"],
    ["MTK-SOLAR-300W", "Microtek Solar Panel 300W", "SOLAR", false, "SOLAR", "SOLAR", "SOLAR", 5000, "10 years", 18, 8500, 4300, "SBU03", "3", 5, "Microtek Solar Panel 300W"],
    ["MTK-SOLAR-500W", "Microtek Solar Panel 500W", "SOLAR", false, "SOLAR", "SOLAR", "SOLAR", 8000, "10 years", 18, 13500, 6900, "SBU03", "3", 5, "Microtek Solar Panel 500W"],
    ["MTK-CHARGE-CONTROLLER", "Microtek Charge Controller", "ACCESSORY", false, "ACCESSORY", "ACCESSORY", "ACCESSORY", 1200, "12 months", 18, 2200, 1000, "SBU04", "4", 20, "Microtek Charge Controller"],
    ["899-95N-1075", "SMART HYBRID NEW 1075 12V SW", "INVERTER", false, "INVERTER", "INVERTER", "INVERTER", 9000, "24 months", 18, 15000, 8200, "SBU01", "1", 5, "SMART HYBRID NEW 1075 12V SW"]
  ]) {
    const row = await upsertOne(client, `
      INSERT INTO product (
        product_code, name, segment, is_battery, category, sub_category, product_category,
        distributor_price, warranty, gst, mrp, base_price, sbu, poll, moq, description, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (product_code) DO UPDATE
      SET name = EXCLUDED.name, segment = EXCLUDED.segment,
          is_battery = EXCLUDED.is_battery, category = EXCLUDED.category,
          sub_category = EXCLUDED.sub_category, product_category = EXCLUDED.product_category,
          distributor_price = EXCLUDED.distributor_price, warranty = EXCLUDED.warranty,
          gst = EXCLUDED.gst, mrp = EXCLUDED.mrp, base_price = EXCLUDED.base_price,
          sbu = EXCLUDED.sbu, poll = EXCLUDED.poll, moq = EXCLUDED.moq,
          description = EXCLUDED.description,
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

    /* SRN serials (dispatched on the return invoice — realistic qty of 2) */
    ["MTK-RET-0001",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-15T00:00:00.000Z"],
    ["MTK-RET-0002",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-16T00:00:00.000Z"],

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
    ["MTK-ACCCHG-0010", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-26T00:00:00.000Z"],

    /* SMART HYBRID NEW 1075 12V SW (899-95N-1075) — IN_STOCK at RW-01 for invoice INV-001 */
    ["SH1075-0001", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["SH1075-0002", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["SH1075-0003", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["SH1075-0004", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["SH1075-0005", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["SH1075-0006", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["SH1075-0007", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["SH1075-0008", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["SH1075-0009", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["SH1075-0010", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["SH1075-0011", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["SH1075-0012", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["SH1075-0013", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["SH1075-0014", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["SH1075-0015", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-08T00:00:00.000Z"],

    /* Additional realistic Microtek serials for new invoices */
    ["SH1075-0016", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["SH1075-0017", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["SH1075-0018", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["SH1075-0019", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["SH1075-0020", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-11T00:00:00.000Z"],
    ["SH1075-0021", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-11T00:00:00.000Z"],
    ["SH1075-0022", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-12T00:00:00.000Z"],
    ["SH1075-0023", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-12T00:00:00.000Z"],
    ["SH1075-0024", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-13T00:00:00.000Z"],
    ["SH1075-0025", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-13T00:00:00.000Z"],
    ["EB100-0001", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["EB100-0002", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-11T00:00:00.000Z"],
    ["EB100-0003", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-12T00:00:00.000Z"],
    ["EB100-0004", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-13T00:00:00.000Z"],
    ["EB100-0005", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-14T00:00:00.000Z"],
    ["EB150-0001", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["EB150-0002", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["EB150-0003", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["EB150-0004", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["EB150-0005", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["EB150-0006", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["EB150-0007", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["EB150-0008", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-08T00:00:00.000Z"],
    ["EB150-0009", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["EB150-0010", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["SP300-0001", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-15T00:00:00.000Z"],
    ["SP300-0002", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-16T00:00:00.000Z"],
    ["SP300-0003", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-17T00:00:00.000Z"],
    ["SP300-0004", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-18T00:00:00.000Z"],
    ["SP300-0005", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-19T00:00:00.000Z"],
    ["SP500-0001", "MTK-SOLAR-500W", "IN_STOCK", warehouses["RW-02"], "2026-05-10T00:00:00.000Z"],
    ["SP500-0002", "MTK-SOLAR-500W", "IN_STOCK", warehouses["RW-02"], "2026-05-11T00:00:00.000Z"],
    ["SP500-0003", "MTK-SOLAR-500W", "IN_STOCK", warehouses["RW-02"], "2026-05-12T00:00:00.000Z"],
    ["EM1K-0001", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-20T00:00:00.000Z"],
    ["EM1K-0002", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-21T00:00:00.000Z"],
    ["EM1K-0003", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-22T00:00:00.000Z"],
    ["EM1K-0004", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-23T00:00:00.000Z"],
    ["EM1K-0005", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-24T00:00:00.000Z"],
    ["EM1K-0006", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-25T00:00:00.000Z"],
    ["EM1K-0007", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-26T00:00:00.000Z"],
    ["EM1K-0008", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-27T00:00:00.000Z"],
    ["EM1K-0009", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-28T00:00:00.000Z"],
    ["EM1K-0010", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-29T00:00:00.000Z"],
    ["EM2K-0001", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-10T00:00:00.000Z"],
    ["EM2K-0002", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-11T00:00:00.000Z"],
    ["EM2K-0003", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-12T00:00:00.000Z"],
    ["EM2K-0004", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-13T00:00:00.000Z"],
    ["EM2K-0005", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-14T00:00:00.000Z"],
    ["EM2K-0006", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-15T00:00:00.000Z"],

    /* Warehouse stock coverage: PLNT-01, CW-01, RW-03 previously had no IN_STOCK serials */
    ["MTK-PLNT-INV1K-0001", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-03T00:00:00.000Z"],
    ["MTK-PLNT-INV1K-0002", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-04T00:00:00.000Z"],
    ["MTK-PLNT-INV1K-0003", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-05T00:00:00.000Z"],
    ["MTK-PLNT-INV1K-0004", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-06T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0001", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-03T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0002", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-04T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0003", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-05T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0004", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-06T00:00:00.000Z"],

    ["MTK-CW01-SOL300-0001", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-05-24T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0002", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-05-29T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0003", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-03T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0004", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-08T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0005", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-13T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0006", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-18T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0001", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-05-25T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0002", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-05-30T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0003", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-04T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0004", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-09T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0005", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-14T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0006", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-19T00:00:00.000Z"],

    ["MTK-RW03-INV2K-0001", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-03-30T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0002", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-04-08T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0003", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-04-17T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0004", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-04-26T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0005", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-05-05T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0001", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-01T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0002", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-10T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0003", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-19T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0004", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-28T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0005", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-05-07T00:00:00.000Z"]
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

async function seedInvoiceRow(client, ref, header, status = "PENDING") {
  return upsertOne(client, `
    INSERT INTO invoice (
      sap_invoice_ref, status,
      order_id, customer_name, customer_code, billing_date, billing_number, division,
      total_sale_qty, item_total, total_amt, transport_name, lr_no, lr_date,
      dispatch_date, delivery_date, sales_order_qty, pod_status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    ON CONFLICT (sap_invoice_ref) DO UPDATE
    SET status = EXCLUDED.status,
        order_id = EXCLUDED.order_id, customer_name = EXCLUDED.customer_name,
        customer_code = EXCLUDED.customer_code, billing_date = EXCLUDED.billing_date,
        billing_number = EXCLUDED.billing_number, division = EXCLUDED.division,
        total_sale_qty = EXCLUDED.total_sale_qty, item_total = EXCLUDED.item_total,
        total_amt = EXCLUDED.total_amt, transport_name = EXCLUDED.transport_name,
        lr_no = EXCLUDED.lr_no, lr_date = EXCLUDED.lr_date,
        dispatch_date = EXCLUDED.dispatch_date, delivery_date = EXCLUDED.delivery_date,
        sales_order_qty = EXCLUDED.sales_order_qty, pod_status = EXCLUDED.pod_status,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_id AS "invoiceId"`,
    [
      ref, status,
      header.orderId ?? null, header.customerName ?? null, header.customerCode ?? null,
      header.billingDate ?? null, header.billingNumber ?? null, header.division ?? null,
      header.totalSaleQty ?? null, header.itemTotal ?? null, header.totalAmt ?? null,
      header.transportName ?? null, header.lrNo ?? null, header.lrDate ?? null,
      header.dispatchDate ?? null, header.deliveryDate ?? null, header.salesOrderQty ?? null,
      header.podStatus ?? null, createdBy
    ]
  );
}

async function seedInvoiceLineRow(client, invoiceId, lineNo, productId, quantity, line = {}) {
  return upsertOne(client, `
    INSERT INTO invoice_line (
      invoice_id, product_id, line_no, required_quantity,
      uom, amount, pod_section, pod_document, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        uom = EXCLUDED.uom, amount = EXCLUDED.amount,
        pod_section = EXCLUDED.pod_section, pod_document = EXCLUDED.pod_document,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [
      invoiceId, productId, lineNo, quantity,
      line.uom ?? "NOS", line.amount ?? null, line.podSection ?? null, line.podDocument ?? null,
      createdBy
    ]
  );
}

async function seedInvoicesAndDispatch(client, { warehouses, products, serials }) {
  /* ── Invoice 1: MTK-INVOICE-001, multi-product ── */
  const invoice1 = await seedInvoiceRow(client, "MTK-INVOICE-001", {
    orderId: "SO-2026-0001",
    customerName: "Sunrise Power Solutions",
    customerCode: "CUST-1001",
    billingDate: "2026-05-10",
    billingNumber: "BILL-2026-0001",
    division: "POWER PRODUCTS",
    totalSaleQty: 25,
    itemTotal: 3,
    totalAmt: 455751,
    transportName: "Bluedart Surface",
    lrNo: "LR-558821",
    lrDate: "2026-05-11",
    dispatchDate: "2026-05-11",
    deliveryDate: "2026-05-14",
    salesOrderQty: 25,
    podStatus: "PENDING"
  });
  /* INV-001 lines: 2x Microtek Inverter 1KVA, 1x Microtek Solar Panel 300W */
  /* INV-001 also carries the example item: 2x SMART HYBRID NEW 1075 12V SW (899-95N-1075) */
  const inv1Line1 = await seedInvoiceLineRow(client, invoice1.invoiceId, 1, products["MTK-INVERTER-1KVA"], 2, {
    uom: "NOS",
    amount: 184500,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv1Line2 = await seedInvoiceLineRow(client, invoice1.invoiceId, 2, products["MTK-SOLAR-300W"], 1, {
    uom: "NOS",
    amount: 195300,
    podSection: "SEC-A",
    podDocument: null
  });
  await seedInvoiceLineRow(client, invoice1.invoiceId, 3, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 75951,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 2: MTK-INVOICE-BATTERY-001 → RW-01, battery-only ── */
  const batteryInvoice = await seedInvoiceRow(client, "MTK-INVOICE-BATTERY-001", {
    orderId: "SO-2026-0002",
    customerName: "Greenline Distributors",
    customerCode: "CUST-1002",
    billingDate: "2026-05-12",
    billingNumber: "BILL-2026-0002",
    division: "ENERGY STORAGE",
    totalSaleQty: 10,
    itemTotal: 1,
    totalAmt: 128000,
    transportName: "VRL Logistics",
    lrNo: "LR-558840",
    lrDate: "2026-05-13",
    dispatchDate: "2026-05-13",
    deliveryDate: "2026-05-16",
    salesOrderQty: 10,
    podStatus: "PENDING"
  });
  const batteryLine = await seedInvoiceLineRow(client, batteryInvoice.invoiceId, 1, products["MTK-BATTERY-100AH"], 2, {
    uom: "NOS",
    amount: 128000,
    podSection: "SEC-A",
    podDocument: null
  });

  /* ── Invoice 3: MTK-INVOICE-RETURN-001 → RW-01, dispatched (for SRN tests) ── */
  const returnInvoice = await seedInvoiceRow(client, "MTK-INVOICE-RETURN-001", {
    orderId: "SO-2026-0003",
    customerName: "Metro Electricals",
    customerCode: "CUST-1003",
    billingDate: "2026-03-20",
    billingNumber: "BILL-2026-0003",
    division: "POWER PRODUCTS",
    totalSaleQty: 10,
    itemTotal: 1,
    totalAmt: 369000,
    transportName: "Gati KWE",
    lrNo: "LR-557210",
    lrDate: "2026-03-21",
    dispatchDate: "2026-03-21",
    deliveryDate: "2026-03-24",
    salesOrderQty: 10,
    podStatus: "RECEIVED"
  }, "DISPATCHED");
  const returnLine = await seedInvoiceLineRow(client, returnInvoice.invoiceId, 1, products["MTK-INVERTER-1KVA"], 2, {
    uom: "NOS",
    amount: 369000,
    podSection: "SEC-A",
    podDocument: "POD-557210.pdf"
  });

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
    "MTK-RET-0002"
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

  /* ── Invoice 4: MTK-INVOICE-002, multi-product ── */
  const invoice2 = await seedInvoiceRow(client, "MTK-INVOICE-002", {
    orderId: "SO-2026-0004",
    customerName: "Coastal Energy Traders",
    customerCode: "CUST-1004",
    billingDate: "2026-05-15",
    billingNumber: "BILL-2026-0004",
    division: "SOLAR & ACCESSORIES",
    totalSaleQty: 10,
    itemTotal: 3,
    totalAmt: 268400,
    transportName: "Safexpress",
    lrNo: "LR-558901",
    lrDate: "2026-05-16",
    dispatchDate: "2026-05-16",
    deliveryDate: "2026-05-19",
    salesOrderQty: 10,
    podStatus: "PENDING"
  });
  /* INV-002 lines: 2x Microtek Inverter 2KVA, 2x Microtek Solar Panel 500W, 1x Microtek Charge Controller */
  const inv2Line1 = await seedInvoiceLineRow(client, invoice2.invoiceId, 1, products["MTK-INVERTER-2KVA"], 2, {
    uom: "NOS",
    amount: 148500,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv2Line2 = await seedInvoiceLineRow(client, invoice2.invoiceId, 2, products["MTK-SOLAR-500W"], 2, {
    uom: "NOS",
    amount: 96000,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv2Line3 = await seedInvoiceLineRow(client, invoice2.invoiceId, 3, products["MTK-CHARGE-CONTROLLER"], 1, {
    uom: "NOS",
    amount: 23900,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 5: MTK-INVOICE-003, SMART HYBRID + standard inverters ── */
  const invoice3 = await seedInvoiceRow(client, "MTK-INVOICE-003", {
    orderId: "SO-2026-0005",
    customerName: "Shakti Energy Solutions",
    customerCode: "CUST-1005",
    billingDate: "2026-05-20",
    billingNumber: "BILL-2026-0005",
    division: "POWER PRODUCTS",
    totalSaleQty: 20,
    itemTotal: 3,
    totalAmt: 625036,
    transportName: "DTDC Surface",
    lrNo: "LR-559012",
    lrDate: "2026-05-21",
    dispatchDate: "2026-05-21",
    deliveryDate: "2026-05-24",
    salesOrderQty: 20,
    podStatus: "PENDING"
  });
  const inv3Line1 = await seedInvoiceLineRow(client, invoice3.invoiceId, 1, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 75951,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv3Line2 = await seedInvoiceLineRow(client, invoice3.invoiceId, 2, products["MTK-INVERTER-1KVA"], 1, {
    uom: "NOS",
    amount: 258300,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv3Line3 = await seedInvoiceLineRow(client, invoice3.invoiceId, 3, products["MTK-BATTERY-150AH"], 2, {
    uom: "NOS",
    amount: 106750,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 6: MTK-INVOICE-004, battery-heavy for fulfilment tests ── */
  const invoice4 = await seedInvoiceRow(client, "MTK-INVOICE-004", {
    orderId: "SO-2026-0006",
    customerName: "Aarav Power Systems",
    customerCode: "CUST-1006",
    billingDate: "2026-05-22",
    billingNumber: "BILL-2026-0006",
    division: "ENERGY STORAGE",
    totalSaleQty: 14,
    itemTotal: 3,
    totalAmt: 458800,
    transportName: "TCI Freight",
    lrNo: "LR-559123",
    lrDate: "2026-05-23",
    dispatchDate: "2026-05-23",
    deliveryDate: "2026-05-27",
    salesOrderQty: 14,
    podStatus: "PENDING"
  });
  const inv4Line1 = await seedInvoiceLineRow(client, invoice4.invoiceId, 1, products["MTK-BATTERY-150AH"], 2, {
    uom: "NOS",
    amount: 128100,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv4Line2 = await seedInvoiceLineRow(client, invoice4.invoiceId, 2, products["MTK-BATTERY-100AH"], 1, {
    uom: "NOS",
    amount: 64000,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv4Line3 = await seedInvoiceLineRow(client, invoice4.invoiceId, 3, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 227853,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 7: MTK-INVOICE-005, solar + inverter + accessories ── */
  const invoice5 = await seedInvoiceRow(client, "MTK-INVOICE-005", {
    orderId: "SO-2026-0007",
    customerName: "Bharat Electricals Ltd",
    customerCode: "CUST-1007",
    billingDate: "2026-05-25",
    billingNumber: "BILL-2026-0007",
    division: "SOLAR & ACCESSORIES",
    totalSaleQty: 12,
    itemTotal: 3,
    totalAmt: 369700,
    transportName: "Om Logistics",
    lrNo: "LR-559234",
    lrDate: "2026-05-26",
    dispatchDate: "2026-05-26",
    deliveryDate: "2026-05-30",
    salesOrderQty: 12,
    podStatus: "PENDING"
  });
  const inv5Line1 = await seedInvoiceLineRow(client, invoice5.invoiceId, 1, products["MTK-SOLAR-300W"], 2, {
    uom: "NOS",
    amount: 195300,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv5Line2 = await seedInvoiceLineRow(client, invoice5.invoiceId, 2, products["MTK-INVERTER-2KVA"], 1, {
    uom: "NOS",
    amount: 198000,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv5Line3 = await seedInvoiceLineRow(client, invoice5.invoiceId, 3, products["MTK-CHARGE-CONTROLLER"], 2, {
    uom: "NOS",
    amount: 14340,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 8: MTK-INVOICE-006, multi-product with SMART HYBRID ── */
  const invoice6 = await seedInvoiceRow(client, "MTK-INVOICE-006", {
    orderId: "SO-2026-0008",
    customerName: "Mumbai Electronics & Controls",
    customerCode: "CUST-1008",
    billingDate: "2026-05-28",
    billingNumber: "BILL-2026-0008",
    division: "POWER PRODUCTS",
    totalSaleQty: 16,
    itemTotal: 3,
    totalAmt: 851249,
    transportName: "Safexpress Plus",
    lrNo: "LR-559345",
    lrDate: "2026-05-29",
    dispatchDate: "2026-05-29",
    deliveryDate: "2026-06-02",
    salesOrderQty: 16,
    podStatus: "PENDING"
  });
  const inv6Line1 = await seedInvoiceLineRow(client, invoice6.invoiceId, 1, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 75951,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv6Line2 = await seedInvoiceLineRow(client, invoice6.invoiceId, 2, products["MTK-INVERTER-1KVA"], 1, {
    uom: "NOS",
    amount: 184500,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv6Line3 = await seedInvoiceLineRow(client, invoice6.invoiceId, 3, products["MTK-BATTERY-150AH"], 2, {
    uom: "NOS",
    amount: 64050,
    podSection: "SEC-B",
    podDocument: "POD-559345.pdf"
  });

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
    inv2Line3Id: inv2Line3.invoiceLineId,
    invoice3Id: invoice3.invoiceId,
    inv3Line1Id: inv3Line1.invoiceLineId,
    inv3Line2Id: inv3Line2.invoiceLineId,
    inv3Line3Id: inv3Line3.invoiceLineId,
    invoice4Id: invoice4.invoiceId,
    inv4Line1Id: inv4Line1.invoiceLineId,
    inv4Line2Id: inv4Line2.invoiceLineId,
    inv4Line3Id: inv4Line3.invoiceLineId,
    invoice5Id: invoice5.invoiceId,
    inv5Line1Id: inv5Line1.invoiceLineId,
    inv5Line2Id: inv5Line2.invoiceLineId,
    inv5Line3Id: inv5Line3.invoiceLineId,
    invoice6Id: invoice6.invoiceId,
    inv6Line1Id: inv6Line1.invoiceLineId,
    inv6Line2Id: inv6Line2.invoiceLineId,
    inv6Line3Id: inv6Line3.invoiceLineId
  };
}

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

async function refreshAgeingSnapshot(client) {
  await client.query("REFRESH MATERIALIZED VIEW ageing_serial_snapshot");
}

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
    invoice3Id: invoice.invoice3Id,
    inv3Line1Id: invoice.inv3Line1Id,
    inv3Line2Id: invoice.inv3Line2Id,
    inv3Line3Id: invoice.inv3Line3Id,
    invoice4Id: invoice.invoice4Id,
    inv4Line1Id: invoice.inv4Line1Id,
    inv4Line2Id: invoice.inv4Line2Id,
    inv4Line3Id: invoice.inv4Line3Id,
    invoice5Id: invoice.invoice5Id,
    inv5Line1Id: invoice.inv5Line1Id,
    inv5Line2Id: invoice.inv5Line2Id,
    inv5Line3Id: invoice.inv5Line3Id,
    invoice6Id: invoice.invoice6Id,
    inv6Line1Id: invoice.inv6Line1Id,
    inv6Line2Id: invoice.inv6Line2Id,
    inv6Line3Id: invoice.inv6Line3Id,
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
