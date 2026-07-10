import { createdBy, upsertOne } from "./constants.js";

export async function seedReferences(client) {
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

export async function seedRolePermissions(client) {
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
