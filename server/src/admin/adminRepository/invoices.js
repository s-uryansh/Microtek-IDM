import { escapeLike } from "./helpers.js";

export function createInvoiceAdminRepository(pool) {
  return {
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
          i.invoice_type AS "invoiceType",
          i.source_warehouse_id AS "sourceWarehouseId",
          sw.code AS "sourceWarehouseCode",
          i.destination_warehouse_id AS "destinationWarehouseId",
          dw.code AS "destinationWarehouseCode",
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
          -- Distinct serials dispatched (completed dispatch) as the baseline, and
          -- distinct serials that are CURRENTLY still returned — i.e. returned and
          -- NOT since re-dispatched (no active, non-returned dispatch scan). This
          -- clears the RETURNED / partial-return tag once a returned serial is
          -- dispatched again.
          COALESCE((
            SELECT COUNT(DISTINCT ds.serial_id) FROM dispatch_scan ds
            JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
            WHERE d.invoice_id = i.invoice_id AND d.status = 'DISPATCHED'
          ), 0)::int AS "dispatchedQty",
          COALESCE((
            SELECT COUNT(DISTINCT ss.serial_id) FROM srn_scan ss
            JOIN srn s ON s.srn_id = ss.srn_id
            WHERE s.invoice_id = i.invoice_id
              AND NOT EXISTS (
                SELECT 1 FROM dispatch_scan ds
                JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
                WHERE d.invoice_id = i.invoice_id
                  AND ds.serial_id = ss.serial_id
                  AND ds.returned_at IS NULL
              )
          ), 0)::int AS "returnedQty"
        FROM invoice i
        LEFT JOIN warehouse sw ON sw.warehouse_id = i.source_warehouse_id
        LEFT JOIN warehouse dw ON dw.warehouse_id = i.destination_warehouse_id
        ${searchCondition}
        ORDER BY i.created_at DESC
      `, params);
      return result.rows;
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
      invoiceType,
      sourceWarehouseId,
      destinationWarehouseId,
      createdBy
    }) {
      const result = await pool.query(
        `
        INSERT INTO invoice (
          sap_invoice_ref, status,
          order_id, customer_name, customer_code, billing_date, billing_number, division,
          total_sale_qty, item_total, total_amt, transport_name, lr_no, lr_date,
          dispatch_date, delivery_date, sales_order_qty, pod_status,
          invoice_type, source_warehouse_id, destination_warehouse_id, created_by
        )
        VALUES ($1, COALESCE($2, 'PENDING'), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, COALESCE($19, 'CUSTOMER'), $20, $21, $22)
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
            invoice_type = EXCLUDED.invoice_type,
            source_warehouse_id = EXCLUDED.source_warehouse_id,
            destination_warehouse_id = EXCLUDED.destination_warehouse_id,
            updated_at = now(), updated_by = EXCLUDED.created_by
        RETURNING invoice_id AS "invoiceId"`,
        [
          sapInvoiceRef, status ?? null,
          orderId ?? null, customerName ?? null, customerCode ?? null, billingDate ?? null,
          billingNumber ?? null, division ?? null, totalSaleQty ?? null, itemTotal ?? null,
          totalAmt ?? null, transportName ?? null, lrNo ?? null, lrDate ?? null,
          dispatchDate ?? null, deliveryDate ?? null, salesOrderQty ?? null, podStatus ?? null,
          invoiceType ?? null, sourceWarehouseId ?? null, destinationWarehouseId ?? null,
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
            SELECT array_agg(DISTINCT dsm.serial_no ORDER BY dsm.serial_no)
            FROM dispatch_scan ds
            JOIN dispatch d ON d.dispatch_id = ds.dispatch_id
            JOIN serial_master dsm ON dsm.serial_id = ds.serial_id
            WHERE ds.invoice_line_id = il.invoice_line_id
              AND d.invoice_id = il.invoice_id
          ), '{}') AS "serialNos",
          -- Serials from this line that are CURRENTLY returned (SRN) — matched back
          -- via the original dispatch scan, and excluding any serial that has since
          -- been re-dispatched (has an active, non-returned dispatch scan on the line).
          COALESCE((
            SELECT array_agg(DISTINCT rsm.serial_no ORDER BY rsm.serial_no)
            FROM srn_scan ss
            JOIN dispatch_scan ds2 ON ds2.dispatch_scan_id = ss.original_dispatch_scan_id
            JOIN serial_master rsm ON rsm.serial_id = ss.serial_id
            WHERE ds2.invoice_line_id = il.invoice_line_id
              AND NOT EXISTS (
                SELECT 1 FROM dispatch_scan ds3
                WHERE ds3.serial_id = ss.serial_id
                  AND ds3.invoice_line_id = il.invoice_line_id
                  AND ds3.returned_at IS NULL
              )
          ), '{}') AS "returnedSerialNos"
        FROM invoice_line il
        JOIN product p ON p.product_id = il.product_id
        WHERE il.invoice_id = ANY($1::bigint[])
        ORDER BY il.invoice_id, il.line_no`,
        [invoiceIds]
      );
      return result.rows;
    }
  };
}
