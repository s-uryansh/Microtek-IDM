function normalizePermissionRows(rows) {
  return rows.map((row) => row.permissionCode).filter(Boolean);
}

export function createAdminRepository(pool) {
  return {
    /* ── Warehouses ── */
    async listWarehouses() {
      const result = await pool.query(`
        SELECT
          warehouse_id AS "warehouseId",
          code,
          name,
          type,
          is_active AS "isActive",
          created_at AS "createdAt"
        FROM warehouse
        ORDER BY code
      `);
      return result.rows;
    },

    async getWarehouseById(warehouseId) {
      const result = await pool.query(
        `
        SELECT
          warehouse_id AS "warehouseId",
          code,
          name,
          type,
          is_active AS "isActive"
        FROM warehouse
        WHERE warehouse_id = $1`,
        [warehouseId]
      );
      return result.rows[0] ?? null;
    },

    async createWarehouse({ code, name, type, createdBy }) {
      const result = await pool.query(
        `
        INSERT INTO warehouse (code, name, type, created_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name, updated_at = now(), updated_by = EXCLUDED.created_by
        RETURNING
          warehouse_id AS "warehouseId",
          code,
          name,
          type,
          is_active AS "isActive"`,
        [code, name, type, createdBy]
      );
      return result.rows[0];
    },

    async toggleWarehouseActive(warehouseId, isActive, updatedBy) {
      const result = await pool.query(
        `
        UPDATE warehouse
        SET is_active = $2, updated_at = now(), updated_by = $3
        WHERE warehouse_id = $1
        RETURNING
          warehouse_id AS "warehouseId",
          code,
          name,
          type,
          is_active AS "isActive"`,
        [warehouseId, isActive, updatedBy]
      );
      return result.rows[0] ?? null;
    },

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
    },

    /* ── Members ── */
    async listMembers({ query } = {}) {
      const values = [];
      const conditions = [];

      if (query?.trim()) {
        values.push(`%${query.trim().toLowerCase()}%`);
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
    },

    /* ── Products ── */
    async listProducts() {
      const result = await pool.query(`
        SELECT
          product_id AS "productId",
          product_code AS "productCode",
          name,
          segment,
          category,
          is_battery AS "isBattery",
          is_active AS "isActive",
          created_at AS "createdAt"
        FROM product
        ORDER BY category, product_code
      `);
      return result.rows;
    },

    async upsertProduct({ productCode, name, segment, category, isBattery, createdBy }) {
      const result = await pool.query(
        `
        INSERT INTO product (product_code, name, segment, category, is_battery, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (product_code) DO UPDATE
        SET name = EXCLUDED.name, segment = EXCLUDED.segment,
            category = EXCLUDED.category, is_battery = EXCLUDED.is_battery,
            updated_at = now(), updated_by = EXCLUDED.created_by
        RETURNING product_id AS "productId", product_code AS "productCode", name`,
        [productCode, name, segment, category, isBattery, createdBy]
      );
      return result.rows[0];
    },

    /* ── Invoices ── */
    async listAllInvoices() {
      const result = await pool.query(`
        SELECT
          i.invoice_id AS "invoiceId",
          i.sap_invoice_ref AS "sapInvoiceRef",
          i.warehouse_id AS "warehouseId",
          w.code AS "warehouseCode",
          i.status,
          i.created_at AS "createdAt"
        FROM invoice i
        JOIN warehouse w ON w.warehouse_id = i.warehouse_id
        ORDER BY i.created_at DESC
      `);
      return result.rows;
    },

    async invoiceLines(invoiceIds) {
      if (!invoiceIds.length) return [];
      const result = await pool.query(
        `
        SELECT
          il.invoice_line_id AS "invoiceLineId",
          il.invoice_id AS "invoiceId",
          il.line_no AS "lineNo",
          il.product_id AS "productId",
          p.product_code AS "productCode",
          p.name AS "productName",
          p.segment,
          p.category,
          p.is_battery AS "isBattery",
          il.required_quantity AS "quantity",
          COALESCE(
            array_agg(DISTINCT sm.serial_no ORDER BY sm.serial_no) FILTER (WHERE sm.serial_no IS NOT NULL),
            '{}'
          ) AS "serialNos"
        FROM invoice_line il
        JOIN invoice i ON i.invoice_id = il.invoice_id
        JOIN product p ON p.product_id = il.product_id
        LEFT JOIN LATERAL (
          SELECT serial_no
          FROM (
            SELECT sm.serial_no
            FROM serial_master sm
            WHERE sm.product_id = il.product_id
              AND sm.current_warehouse_id = i.warehouse_id
              AND sm.current_status = 'IN_STOCK'
            UNION
            SELECT dsm.serial_no
            FROM dispatch_scan ds
            JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
            JOIN serial_master dsm ON dsm.serial_id = ds.serial_id
            WHERE ds.invoice_line_id = il.invoice_line_id
              AND d.invoice_id = il.invoice_id
          ) serial_pool
          ORDER BY serial_no
          LIMIT il.required_quantity
        ) sm ON TRUE
        WHERE il.invoice_id = ANY($1::bigint[])
        GROUP BY
          il.invoice_line_id,
          il.invoice_id,
          il.line_no,
          il.product_id,
          i.warehouse_id,
          p.product_code,
          p.name,
          p.segment,
          p.category,
          p.is_battery,
          il.required_quantity
        ORDER BY il.invoice_id, il.line_no`,
        [invoiceIds]
      );
      return result.rows;
    }
  };
}
