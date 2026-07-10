import { escapeLike } from "./helpers.js";

export function createMemberRepository(pool) {
  return {
    // Soft delete / restore a member: flip is_active. Deactivated users can no
    // longer authenticate (login checks is_active) but their history is retained.
    async toggleMemberActive(userId, isActive, updatedBy) {
      const result = await pool.query(
        `
        UPDATE app_user
        SET is_active = $2, updated_at = now(), updated_by = $3
        WHERE app_user_id = $1
        RETURNING
          app_user_id AS "userId",
          external_ref AS "externalRef",
          username,
          display_name AS "displayName",
          default_warehouse_id AS "defaultWarehouseId",
          is_active AS "isActive"`,
        [userId, isActive, updatedBy]
      );
      return result.rows[0] ?? null;
    },

    /* ── Members ── */
    async listMembers({ query } = {}) {
      const values = [];
      const conditions = [];

      if (query?.trim()) {
        values.push(`%${escapeLike(query.trim().toLowerCase())}%`);
        conditions.push(`(lower(au.username) LIKE $${values.length} OR lower(au.display_name) LIKE $${values.length})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await pool.query(
        `
        SELECT
          au.app_user_id AS "userId",
          au.external_ref AS "externalRef",
          au.username,
          au.display_name AS "displayName",
          au.default_warehouse_id AS "defaultWarehouseId",
          au.is_active AS "isActive",
          au.created_at AS "createdAt",
          r.role_id AS "roleId",
          r.code AS "roleCode",
          r.name AS "roleName",
          COALESCE(
            array_agg(DISTINCT auw.warehouse_id) FILTER (WHERE auw.warehouse_id IS NOT NULL),
            '{}'
          ) AS "warehouseIds"
        FROM app_user au
        JOIN role r ON r.role_id = au.role_id
        LEFT JOIN app_user_warehouse auw ON auw.app_user_id = au.app_user_id
        ${whereClause}
        GROUP BY au.app_user_id, r.role_id
        ORDER BY lower(au.username)`,
        values
      );

      return result.rows.map((row) => ({
        ...row,
        warehouseIds: Array.isArray(row.warehouseIds) ? row.warehouseIds.map((id) => Number(id)).filter(Number.isInteger) : []
      }));
    },

    async getMemberById(userId) {
      const result = await pool.query(
        `
        SELECT
          au.app_user_id AS "userId",
          au.external_ref AS "externalRef",
          au.username,
          au.display_name AS "displayName",
          au.password_hash AS "passwordHash",
          au.default_warehouse_id AS "defaultWarehouseId",
          au.is_active AS "isActive",
          au.created_at AS "createdAt",
          r.role_id AS "roleId",
          r.code AS "roleCode",
          r.name AS "roleName",
          COALESCE(
            array_agg(DISTINCT auw.warehouse_id) FILTER (WHERE auw.warehouse_id IS NOT NULL),
            '{}'
          ) AS "warehouseIds"
        FROM app_user au
        JOIN role r ON r.role_id = au.role_id
        LEFT JOIN app_user_warehouse auw ON auw.app_user_id = au.app_user_id
        WHERE au.app_user_id = $1
        GROUP BY au.app_user_id, r.role_id`,
        [userId]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        ...row,
        warehouseIds: Array.isArray(row.warehouseIds) ? row.warehouseIds.map((id) => Number(id)).filter(Number.isInteger) : []
      };
    },

    async createMember({
      externalRef,
      username,
      displayName,
      passwordHash,
      roleId,
      defaultWarehouseId,
      warehouseIds,
      isActive,
      createdBy
    }) {
      const result = await pool.query(
        `
        INSERT INTO app_user (
          external_ref,
          username,
          display_name,
          password_hash,
          role_id,
          default_warehouse_id,
          is_active,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          app_user_id AS "userId",
          external_ref AS "externalRef",
          username,
          display_name AS "displayName",
          default_warehouse_id AS "defaultWarehouseId",
          is_active AS "isActive"`,
        [externalRef ?? null, username, displayName, passwordHash, roleId, defaultWarehouseId ?? null, isActive, createdBy]
      );

      const user = result.rows[0];
      await this.replaceMemberWarehouses(user.userId, warehouseIds ?? [], createdBy);
      return user;
    },

    async updateMember({
      userId,
      externalRef,
      username,
      displayName,
      passwordHash,
      roleId,
      defaultWarehouseId,
      warehouseIds,
      isActive,
      updatedBy
    }) {
      const updates = [];
      const values = [];

      if (externalRef !== undefined) {
        values.push(externalRef);
        updates.push(`external_ref = $${values.length}`);
      }
      if (username !== undefined) {
        values.push(username);
        updates.push(`username = $${values.length}`);
      }
      if (displayName !== undefined) {
        values.push(displayName);
        updates.push(`display_name = $${values.length}`);
      }
      if (passwordHash !== undefined) {
        values.push(passwordHash);
        updates.push(`password_hash = $${values.length}`);
      }
      if (roleId !== undefined) {
        values.push(roleId);
        updates.push(`role_id = $${values.length}`);
      }
      if (defaultWarehouseId !== undefined) {
        values.push(defaultWarehouseId);
        updates.push(`default_warehouse_id = $${values.length}`);
      }
      if (isActive !== undefined) {
        values.push(isActive);
        updates.push(`is_active = $${values.length}`);
      }

      values.push(updatedBy);
      updates.push(`updated_by = $${values.length}`);
      updates.push(`updated_at = now()`);
      values.push(userId);

      const result = await pool.query(
        `
        UPDATE app_user
        SET ${updates.join(", ")}
        WHERE app_user_id = $${values.length}
        RETURNING
          app_user_id AS "userId",
          external_ref AS "externalRef",
          username,
          display_name AS "displayName",
          default_warehouse_id AS "defaultWarehouseId",
          is_active AS "isActive"`,
        values
      );

      if (Array.isArray(warehouseIds)) {
        await this.replaceMemberWarehouses(userId, warehouseIds, updatedBy);
      }

      return result.rows[0] ?? null;
    },

    async replaceMemberWarehouses(userId, warehouseIds, createdBy) {
      await pool.query(
        `
        DELETE FROM app_user_warehouse
        WHERE app_user_id = $1`,
        [userId]
      );

      if (!warehouseIds.length) {
        return [];
      }

      const rows = [];
      for (const warehouseId of warehouseIds) {
        const result = await pool.query(
          `
          INSERT INTO app_user_warehouse (app_user_id, warehouse_id, created_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (app_user_id, warehouse_id) DO NOTHING
          RETURNING app_user_warehouse_id AS "appUserWarehouseId"`,
          [userId, warehouseId, createdBy]
        );
        if (result.rows[0]) {
          rows.push(result.rows[0]);
        }
      }
      return rows;
    }
  };
}
