import { createdBy, HASH } from "./constants.js";
import { q, q1 } from "./helpers.js";

// ─── load existing reference IDs ─────────────────────────────────────────────

export async function loadRefs(client) {
  const whs   = await q(client, "SELECT warehouse_id AS id, code FROM warehouse");
  const prods = await q(client, "SELECT product_id AS id, product_code AS code FROM product");
  const roles = await q(client, "SELECT role_id AS id, code FROM role");
  return {
    wh:   Object.fromEntries(whs.map(r => [r.code, Number(r.id)])),
    prod: Object.fromEntries(prods.map(r => [r.code, Number(r.id)])),
    role: Object.fromEntries(roles.map(r => [r.code, Number(r.id)])),
  };
}

// ─── 1. Warehouses ────────────────────────────────────────────────────────────

export async function seedWarehouses(client) {
  for (const [code, name, type] of [
    ["PLNT-02", "Microtek Plant 02",                 "PLANT"],
    ["CW-02",   "Microtek Central Warehouse 02",     "CENTRAL"],
    ["RW-04",   "Microtek Regional Warehouse 04",    "REGIONAL"],
    ["RW-05",   "Microtek Regional Warehouse 05",    "REGIONAL"],
  ]) {
    await client.query(
      `INSERT INTO warehouse (code, name, type, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, updated_at=now(), updated_by=EXCLUDED.created_by`,
      [code, name, type, createdBy]
    );
  }
}

// ─── 2. Users ─────────────────────────────────────────────────────────────────

export async function seedUsers(client, refs) {
  for (const { username, displayName, roleCode, defaultWh, warehouses } of [
    { username:"supervisor_2", displayName:"Central Supervisor (CW-02)", roleCode:"supervisor",          defaultWh:"CW-02", warehouses:["CW-01","CW-02"] },
    { username:"operator_2",   displayName:"Regional Operator (RW-01)",  roleCode:"warehouse_operator", defaultWh:"RW-01", warehouses:["RW-01"] },
    { username:"operator_3",   displayName:"Regional Operator (RW-02)",  roleCode:"warehouse_operator", defaultWh:"RW-02", warehouses:["RW-02"] },
    { username:"operator_4",   displayName:"Regional Operator (RW-03)",  roleCode:"warehouse_operator", defaultWh:"RW-03", warehouses:["RW-03"] },
  ]) {
    const u = await q1(client,
      `INSERT INTO app_user (username, display_name, password_hash, role_id, default_warehouse_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (username) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=now(), updated_by=EXCLUDED.created_by
       RETURNING app_user_id`,
      [username, displayName, HASH, refs.role[roleCode], refs.wh[defaultWh], createdBy]
    );
    const uid = Number(u.app_user_id);
    // Replace warehouse assignments
    await client.query(`DELETE FROM app_user_warehouse WHERE app_user_id=$1 AND created_by=$2`, [uid, createdBy]);
    for (const wc of warehouses) {
      await client.query(
        `INSERT INTO app_user_warehouse (app_user_id, warehouse_id, created_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [uid, refs.wh[wc], createdBy]
      );
    }
  }
}
