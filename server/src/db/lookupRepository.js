const MAX_LIMIT = 25;

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return MAX_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function queryPattern(query) {
  return `%${String(query || "").trim()}%`;
}

export function createLookupRepository(pool) {
  async function invoiceLines(invoiceIds) {
    if (!invoiceIds.length) return new Map();

    const result = await pool.query(
      `SELECT
         il.invoice_id AS "invoiceId",
         il.invoice_line_id AS "invoiceLineId",
         il.line_no AS "lineNo",
         il.product_id AS "productId",
         p.product_code AS "productCode",
         p.name AS "productName",
         p.category,
         p.segment,
         p.is_battery AS "isBattery",
         il.required_quantity AS "quantity",
         il.uom,
         il.amount
       FROM invoice_line il
       JOIN product p ON p.product_id = il.product_id
       WHERE il.invoice_id = ANY($1::bigint[])
       ORDER BY il.invoice_id, il.line_no`,
      [invoiceIds]
    );

    return result.rows.reduce((map, line) => {
      const lines = map.get(line.invoiceId) || [];
      lines.push(line);
      map.set(line.invoiceId, lines);
      return map;
    }, new Map());
  }

  async function dispatchDocLines(docIds) {
    if (!docIds.length) return new Map();

    const result = await pool.query(
      `SELECT
         sdl.sap_dispatch_doc_id AS "sapDispatchDocId",
         sdl.sap_dispatch_line_id AS "sapDispatchLineId",
         sdl.line_no AS "lineNo",
         sm.serial_no AS "serialNo",
         p.product_code AS "productCode",
         p.name AS "productName"
       FROM sap_dispatch_line sdl
       JOIN serial_master sm ON sm.serial_id = sdl.serial_id
       JOIN product p ON p.product_id = sdl.product_id
       WHERE sdl.sap_dispatch_doc_id = ANY($1::bigint[])
       ORDER BY sdl.sap_dispatch_doc_id, sdl.line_no`,
      [docIds]
    );

    return result.rows.reduce((map, line) => {
      const lines = map.get(line.sapDispatchDocId) || [];
      lines.push(line);
      map.set(line.sapDispatchDocId, lines);
      return map;
    }, new Map());
  }

  return {
    async searchInvoices({ query, batteryOnly = false, limit = MAX_LIMIT }) {
      // Invoices are warehouse-agnostic: any operator can look one up by id or
      // SAP ref. Warehouse scoping is enforced later, per scanned serial.
      const result = await pool.query(
        `SELECT
           i.invoice_id AS "invoiceId",
           i.sap_invoice_ref AS "sapInvoiceRef",
           i.status,
           i.created_at AS "createdAt"
         FROM invoice i
         WHERE ($1::text = '' OR i.sap_invoice_ref ILIKE $2 OR CAST(i.invoice_id AS text) = $1)
           AND (
             $3::boolean = FALSE OR EXISTS (
               SELECT 1
               FROM invoice_line il
               JOIN product p ON p.product_id = il.product_id
               WHERE il.invoice_id = i.invoice_id
                 AND p.is_battery = TRUE
             )
           )
         ORDER BY
           (CAST(i.invoice_id AS text) = $1) DESC,
           (UPPER(i.sap_invoice_ref) = UPPER($1)) DESC,
           i.created_at DESC, i.invoice_id DESC
         LIMIT $4`,
        [String(query || "").trim(), queryPattern(query), batteryOnly, normalizeLimit(limit)]
      );
      const linesByInvoice = await invoiceLines(result.rows.map((row) => row.invoiceId));
      return result.rows.map((invoice) => ({ ...invoice, lines: linesByInvoice.get(invoice.invoiceId) || [] }));
    },

    async searchDispatchDocs({ query, warehouseIds, limit = MAX_LIMIT }) {
      const result = await pool.query(
        `SELECT
           sdd.sap_dispatch_doc_id AS "sapDispatchDocId",
           sdd.external_ref AS "externalRef",
           sdd.source_warehouse_id AS "sourceWarehouseId",
           sw.code AS "sourceWarehouseCode",
           sdd.destination_warehouse_id AS "destinationWarehouseId",
           dw.code AS "destinationWarehouseCode",
           sdd.status,
           sdd.created_at AS "createdAt"
         FROM sap_dispatch_doc sdd
         LEFT JOIN warehouse sw ON sw.warehouse_id = sdd.source_warehouse_id
         JOIN warehouse dw ON dw.warehouse_id = sdd.destination_warehouse_id
         WHERE sdd.destination_warehouse_id = ANY($1::bigint[])
           AND ($2::text = '' OR sdd.external_ref ILIKE $3 OR CAST(sdd.sap_dispatch_doc_id AS text) = $2)
         ORDER BY sdd.created_at DESC, sdd.sap_dispatch_doc_id DESC
         LIMIT $4`,
        [warehouseIds, String(query || "").trim(), queryPattern(query), normalizeLimit(limit)]
      );
      const linesByDoc = await dispatchDocLines(result.rows.map((row) => row.sapDispatchDocId));
      return result.rows.map((doc) => ({ ...doc, lines: linesByDoc.get(doc.sapDispatchDocId) || [] }));
    },

    async searchDispatches({ query, warehouseIds, limit = MAX_LIMIT }) {
      const result = await pool.query(
        `SELECT
           d.dispatch_id AS "dispatchId",
           d.invoice_id AS "invoiceId",
           i.sap_invoice_ref AS "sapInvoiceRef",
           d.warehouse_id AS "warehouseId",
           w.code AS "warehouseCode",
           d.status,
           d.started_at AS "startedAt"
         FROM dispatch d
         JOIN invoice i ON i.invoice_id = d.invoice_id
         JOIN warehouse w ON w.warehouse_id = d.warehouse_id
         WHERE d.warehouse_id = ANY($1::bigint[])
           AND ($2::text = '' OR i.sap_invoice_ref ILIKE $3 OR CAST(d.dispatch_id AS text) = $2 OR CAST(i.invoice_id AS text) = $2)
         ORDER BY d.started_at DESC, d.dispatch_id DESC
         LIMIT $4`,
        [warehouseIds, String(query || "").trim(), queryPattern(query), normalizeLimit(limit)]
      );
      return result.rows;
    },

    async searchWarehouses({ query, warehouseIds, limit = MAX_LIMIT }) {
      const result = await pool.query(
        `SELECT
           warehouse_id AS "warehouseId",
           code,
           name,
           type
         FROM warehouse
         WHERE warehouse_id = ANY($1::bigint[])
           AND ($2::text = '' OR code ILIKE $3 OR name ILIKE $3 OR CAST(warehouse_id AS text) = $2)
         ORDER BY code
         LIMIT $4`,
        [warehouseIds, String(query || "").trim(), queryPattern(query), normalizeLimit(limit)]
      );
      return result.rows;
    }
  };
}
