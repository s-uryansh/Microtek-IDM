import {
  createdBy,
  defaultAdminPasswordHash,
  defaultOperatorPasswordHash,
  defaultSupervisorPasswordHash,
  upsertOne
} from "./constants.js";

export async function seedDefaultAdmin(client, { warehouses }) {
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

export async function seedStaffUsers(client, { warehouses }) {
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
