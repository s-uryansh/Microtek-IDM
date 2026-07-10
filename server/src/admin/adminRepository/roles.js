import { normalizePermissionRows } from "./helpers.js";

export function createRoleRepository(pool) {
  return {
    /* ── Roles ── */
    async listRoles() {
      const result = await pool.query(`
        SELECT
          r.role_id AS "roleId",
          r.code,
          r.name,
          r.is_active AS "isActive",
          r.created_at AS "createdAt",
          COALESCE(
            array_agg(DISTINCT rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL),
            '{}'
          ) AS "permissions",
          COUNT(DISTINCT au.app_user_id)::int AS "memberCount"
        FROM role r
        LEFT JOIN role_permission rp ON rp.role_id = r.role_id
        LEFT JOIN app_user au ON au.role_id = r.role_id
        GROUP BY r.role_id
        ORDER BY r.code
      `);

      return result.rows.map((row) => ({
        ...row,
        permissions: Array.isArray(row.permissions) ? row.permissions : []
      }));
    },

    async getRoleById(roleId) {
      const result = await pool.query(
        `
        SELECT
          role_id AS "roleId",
          code,
          name,
          is_active AS "isActive"
        FROM role
        WHERE role_id = $1`,
        [roleId]
      );
      return result.rows[0] ?? null;
    },

    async getRoleByCode(roleCode) {
      const result = await pool.query(
        `
        SELECT
          role_id AS "roleId",
          code,
          name,
          is_active AS "isActive"
        FROM role
        WHERE code = $1`,
        [roleCode]
      );
      return result.rows[0] ?? null;
    },

    async getPermissionsForRoleCode(roleCode) {
      const result = await pool.query(
        `
        SELECT rp.permission_code AS "permissionCode"
        FROM role r
        JOIN role_permission rp ON rp.role_id = r.role_id
        WHERE r.code = $1
          AND r.is_active = TRUE
        ORDER BY rp.permission_code`,
        [roleCode]
      );
      return new Set(normalizePermissionRows(result.rows));
    },

    async createRole({ code, name, isActive = true, permissionCodes = [], createdBy }) {
      const result = await pool.query(
        `
        INSERT INTO role (code, name, is_active, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING
          role_id AS "roleId",
          code,
          name,
          is_active AS "isActive"`,
        [code, name, isActive, createdBy]
      );

      const role = result.rows[0];
      if (permissionCodes.length > 0) {
        await this.replaceRolePermissions(role.roleId, permissionCodes, createdBy);
      }
      return role;
    },

    async updateRole({ roleId, name, isActive, permissionCodes, updatedBy }) {
      const updates = [];
      const values = [];

      if (name !== undefined) {
        values.push(name);
        updates.push(`name = $${values.length}`);
      }
      if (isActive !== undefined) {
        values.push(isActive);
        updates.push(`is_active = $${values.length}`);
      }

      values.push(updatedBy);
      updates.push(`updated_by = $${values.length}`);
      updates.push(`updated_at = now()`);
      values.push(roleId);

      const result = await pool.query(
        `
        UPDATE role
        SET ${updates.join(", ")}
        WHERE role_id = $${values.length}
        RETURNING
          role_id AS "roleId",
          code,
          name,
          is_active AS "isActive"`,
        values
      );

      if (Array.isArray(permissionCodes)) {
        await this.replaceRolePermissions(roleId, permissionCodes, updatedBy);
      }

      return result.rows[0] ?? null;
    },

    async replaceRolePermissions(roleId, permissionCodes, createdBy) {
      await pool.query(
        `
        DELETE FROM role_permission
        WHERE role_id = $1`,
        [roleId]
      );

      if (!permissionCodes.length) {
        return [];
      }

      const rows = [];
      for (const permissionCode of permissionCodes) {
        const result = await pool.query(
          `
          INSERT INTO role_permission (role_id, permission_code, created_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_id, permission_code) DO UPDATE
          SET created_by = EXCLUDED.created_by
          RETURNING
            role_permission_id AS "rolePermissionId",
            permission_code AS "permissionCode"`,
          [roleId, permissionCode, createdBy]
        );
        rows.push(result.rows[0]);
      }
      return rows;
    }
  };
}
