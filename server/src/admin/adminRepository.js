function normalizePermissionRows(rows) {
  return rows.map((row) => row.permissionCode).filter(Boolean);
}

// Escape LIKE/ILIKE wildcards so a search term is matched literally (the values
// are already passed as parameters; this only fixes match semantics, not safety).
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

export function createAdminRepository(pool) {
  return {
    /* ── Warehouses ── */
    async listWarehouses() {
      const result = await pool.query(`
        SELECT
          w.warehouse_id AS "warehouseId",
          w.code,
          w.name,
          w.type,
          w.is_active AS "isActive",
          w.created_at AS "createdAt",
          COALESCE(s.unit_count, 0)::int AS "unitCount"
        FROM warehouse w
        LEFT JOIN (
          SELECT current_warehouse_id, COUNT(*) AS unit_count
          FROM serial_master
          WHERE current_status = 'IN_STOCK'
          GROUP BY current_warehouse_id
        ) s ON s.current_warehouse_id = w.warehouse_id
        ORDER BY w.code
      `);
      return result.rows;
    },

    async listWarehouseStock() {
      // Every individual product unit (serial) currently in stock, with its
      // product and the warehouse it physically sits in.
      const result = await pool.query(`
        SELECT
          sm.serial_id AS "serialId",
          sm.serial_no AS "serialNo",
          sm.current_status AS "serialStatus",
          p.product_id AS "productId",
          p.product_code AS "productCode",
          p.name AS "productName",
          w.warehouse_id AS "warehouseId",
          w.code AS "warehouseCode",
          w.name AS "warehouseName"
        FROM serial_master sm
        JOIN product p ON p.product_id = sm.product_id
        JOIN warehouse w ON w.warehouse_id = sm.current_warehouse_id
        WHERE sm.current_status = 'IN_STOCK'
        ORDER BY w.code, p.product_code, sm.serial_no
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
    async listAllInvoices({ query } = {}) {
      const searchCondition = query
        ? `WHERE (i.sap_invoice_ref ILIKE $1 OR CAST(i.invoice_id AS text) = $1 OR i.order_id ILIKE $1 OR i.customer_name ILIKE $1 OR i.billing_number ILIKE $1)`
        : ``;
      const params = query ? [`%${escapeLike(query)}%`] : [];
      const result = await pool.query(`
        SELECT
          i.invoice_id AS "invoiceId",
          i.sap_invoice_ref AS "sapInvoiceRef",
          i.status,
          i.created_at AS "createdAt",
          i.created_at AS "uploadedDate",
          i.order_id AS "orderId",
          i.customer_name AS "customerName",
          i.customer_code AS "customerCode",
          i.billing_date::text AS "billingDate",
          i.billing_number AS "billingNumber",
          i.division,
          i.total_sale_qty AS "totalSaleQty",
          i.item_total AS "itemTotal",
          i.total_amt AS "totalAmt",
          i.transport_name AS "transportName",
          i.lr_no AS "lrNo",
          i.lr_date::text AS "lrDate",
          i.dispatch_date::text AS "dispatchDate",
          i.delivery_date::text AS "deliveryDate",
          i.sales_order_qty AS "salesOrderQty",
          i.pod_status AS "podStatus",
          -- Units dispatched (completed dispatch) and units since returned, so
          -- the admin panel can show a RETURNED / partial-return tag.
          COALESCE((
            SELECT COUNT(*) FROM dispatch_scan ds
            JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
            WHERE d.invoice_id = i.invoice_id AND d.status = 'DISPATCHED'
          ), 0)::int AS "dispatchedQty",
          COALESCE((
            SELECT COUNT(*) FROM srn_scan ss
            JOIN srn s ON s.srn_id = ss.srn_id
            WHERE s.invoice_id = i.invoice_id
          ), 0)::int AS "returnedQty"
        FROM invoice i
        ${searchCondition}
        ORDER BY i.created_at DESC
      `, params);
      return result.rows;
    },

    async getWarehouseByCode(code) {
      const result = await pool.query(
        `SELECT warehouse_id AS "warehouseId", code FROM warehouse WHERE code = $1`,
        [code]
      );
      return result.rows[0] ?? null;
    },

    async getProductByCode(productCode) {
      const result = await pool.query(
        `SELECT product_id AS "productId", product_code AS "productCode" FROM product WHERE product_code = $1`,
        [productCode]
      );
      return result.rows[0] ?? null;
    },

    async upsertInvoice({
      sapInvoiceRef,
      status,
      orderId,
      customerName,
      customerCode,
      billingDate,
      billingNumber,
      division,
      totalSaleQty,
      itemTotal,
      totalAmt,
      transportName,
      lrNo,
      lrDate,
      dispatchDate,
      deliveryDate,
      salesOrderQty,
      podStatus,
      createdBy
    }) {
      const result = await pool.query(
        `
        INSERT INTO invoice (
          sap_invoice_ref, status,
          order_id, customer_name, customer_code, billing_date, billing_number, division,
          total_sale_qty, item_total, total_amt, transport_name, lr_no, lr_date,
          dispatch_date, delivery_date, sales_order_qty, pod_status, created_by
        )
        VALUES ($1, COALESCE($2, 'PENDING'), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
          sapInvoiceRef, status ?? null,
          orderId ?? null, customerName ?? null, customerCode ?? null, billingDate ?? null,
          billingNumber ?? null, division ?? null, totalSaleQty ?? null, itemTotal ?? null,
          totalAmt ?? null, transportName ?? null, lrNo ?? null, lrDate ?? null,
          dispatchDate ?? null, deliveryDate ?? null, salesOrderQty ?? null, podStatus ?? null,
          createdBy
        ]
      );
      return result.rows[0];
    },

    async upsertInvoiceLine({
      invoiceId,
      lineNo,
      productId,
      requiredQuantity,
      uom,
      amount,
      podSection,
      podDocument,
      createdBy
    }) {
      const result = await pool.query(
        `
        INSERT INTO invoice_line (
          invoice_id, product_id, line_no, required_quantity, uom, amount, pod_section, pod_document, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (invoice_id, line_no) DO UPDATE
        SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
            uom = EXCLUDED.uom, amount = EXCLUDED.amount,
            pod_section = EXCLUDED.pod_section, pod_document = EXCLUDED.pod_document,
            updated_at = now(), updated_by = EXCLUDED.created_by
        RETURNING invoice_line_id AS "invoiceLineId"`,
        [
          invoiceId, productId, lineNo, requiredQuantity,
          uom ?? null, amount ?? null, podSection ?? null, podDocument ?? null, createdBy
        ]
      );
      return result.rows[0];
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
          il.uom,
          il.amount,
          il.pod_section AS "podSection",
          il.pod_document AS "podDocument",
          -- Serials actually DISPATCHED for this invoice line (never in-stock
          -- serials that were not dispatched).
          COALESCE((
            SELECT array_agg(dsm.serial_no ORDER BY dsm.serial_no)
            FROM dispatch_scan ds
            JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
            JOIN serial_master dsm ON dsm.serial_id = ds.serial_id
            WHERE ds.invoice_line_id = il.invoice_line_id
              AND d.invoice_id = il.invoice_id
          ), '{}') AS "serialNos",
          -- Serials from this line that have since been RETURNED (SRN), matched
          -- back to the line via the original dispatch scan.
          COALESCE((
            SELECT array_agg(rsm.serial_no ORDER BY rsm.serial_no)
            FROM srn_scan ss
            JOIN dispatch_scan ds2 ON ds2.dispatch_scan_id = ss.original_dispatch_scan_id
            JOIN serial_master rsm ON rsm.serial_id = ss.serial_id
            WHERE ds2.invoice_line_id = il.invoice_line_id
          ), '{}') AS "returnedSerialNos"
        FROM invoice_line il
        JOIN product p ON p.product_id = il.product_id
        WHERE il.invoice_id = ANY($1::bigint[])
        ORDER BY il.invoice_id, il.line_no`,
        [invoiceIds]
      );
      return result.rows;
    },

    /* ── Inbound stock (SAP dispatch documents) ── */
    async listDispatchDocs() {
      const result = await pool.query(`
        SELECT
          sdd.sap_dispatch_doc_id AS "sapDispatchDocId",
          sdd.external_ref AS "externalRef",
          sdd.status,
          sdd.created_at AS "createdAt",
          sdd.source_warehouse_id AS "sourceWarehouseId",
          sw.code AS "sourceWarehouseCode",
          sw.name AS "sourceWarehouseName",
          sdd.destination_warehouse_id AS "destinationWarehouseId",
          dw.code AS "destinationWarehouseCode",
          dw.name AS "destinationWarehouseName"
        FROM sap_dispatch_doc sdd
        JOIN warehouse dw ON dw.warehouse_id = sdd.destination_warehouse_id
        LEFT JOIN warehouse sw ON sw.warehouse_id = sdd.source_warehouse_id
        ORDER BY sdd.created_at DESC, sdd.sap_dispatch_doc_id DESC
      `);
      return result.rows.map((row) => ({
        ...row,
        sapDispatchDocId: Number(row.sapDispatchDocId),
        sourceWarehouseId: row.sourceWarehouseId === null ? null : Number(row.sourceWarehouseId),
        destinationWarehouseId: Number(row.destinationWarehouseId)
      }));
    },

    async dispatchDocLines(docIds) {
      if (!docIds.length) return [];
      const result = await pool.query(
        `
        SELECT
          sl.sap_dispatch_doc_id AS "sapDispatchDocId",
          sl.line_no AS "lineNo",
          sl.product_id AS "productId",
          p.product_code AS "productCode",
          p.name AS "productName",
          sm.serial_no AS "serialNo",
          sm.current_status AS "serialStatus"
        FROM sap_dispatch_line sl
        JOIN serial_master sm ON sm.serial_id = sl.serial_id
        JOIN product p ON p.product_id = sl.product_id
        WHERE sl.sap_dispatch_doc_id = ANY($1::bigint[])
        ORDER BY sl.sap_dispatch_doc_id, sl.line_no`,
        [docIds]
      );
      return result.rows.map((row) => ({
        ...row,
        sapDispatchDocId: Number(row.sapDispatchDocId)
      }));
    }
  };
}
