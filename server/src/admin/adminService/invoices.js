import { parse } from "csv-parse/sync";

import { sanitizeCsvCell } from "../../utils/sanitizeCsvCell.js";
import { normalizeText, csvCellValue, csvNumber, csvInteger, csvDate } from "./shared.js";

// Flat CSV: one row per invoice line, with the invoice header columns repeated on
// every line of the same invoice (grouped on import by sap_invoice_ref).
const INVOICE_CSV_HEADERS = [
  "sap_invoice_ref", "status",
  "order_id", "customer_name", "customer_code", "billing_date", "billing_number", "division",
  "total_sale_qty", "item_total", "total_amt", "transport_name", "lr_no", "lr_date",
  "dispatch_date", "delivery_date", "sales_order_qty", "pod_status",
  "line_no", "material_code", "bill_qty", "uom", "amount", "pod_section", "pod_document"
];

function invoiceHeaderCells(inv) {
  return [
    inv.sapInvoiceRef,
    inv.status,
    inv.orderId,
    inv.customerName,
    inv.customerCode,
    inv.billingDate,
    inv.billingNumber,
    inv.division,
    inv.totalSaleQty,
    inv.itemTotal,
    inv.totalAmt,
    inv.transportName,
    inv.lrNo,
    inv.lrDate,
    inv.dispatchDate,
    inv.deliveryDate,
    inv.salesOrderQty,
    inv.podStatus
  ].map(csvCellValue);
}

function invoiceLineCells(line) {
  return [
    line.lineNo,
    line.productCode,
    line.quantity,
    line.uom,
    line.amount,
    line.podSection,
    line.podDocument
  ].map(csvCellValue);
}

export function createInvoiceService({ adminRepo }) {
  return {
    /*
       INVOICES — admin listing
*/

    async listAllInvoices({ query } = {}) {
      const invoices = await adminRepo.listAllInvoices({ query });
      const invoiceIds = invoices.map((inv) => inv.invoiceId);
      const lines = await adminRepo.invoiceLines(invoiceIds);

      const linesByInvoiceId = {};
      for (const line of lines) {
        if (!linesByInvoiceId[line.invoiceId]) {
          linesByInvoiceId[line.invoiceId] = [];
        }
        linesByInvoiceId[line.invoiceId].push(line);
      }

      return invoices.map((inv) => ({
        ...inv,
        lines: linesByInvoiceId[inv.invoiceId] || []
      }));
    },

    /*
       INVOICES — admin-only CSV import / export
*/

    async exportInvoicesCsv() {
      const invoices = await this.listAllInvoices();
      const headerLine = INVOICE_CSV_HEADERS.map(sanitizeCsvCell).join(",");

      const bodyLines = [];
      for (const inv of invoices) {
        const header = invoiceHeaderCells(inv);
        const lines = inv.lines || [];
        if (lines.length === 0) {
          bodyLines.push([...header, "", "", "", "", "", "", ""].map(sanitizeCsvCell).join(","));
          continue;
        }
        for (const line of lines) {
          bodyLines.push(
            [...header, ...invoiceLineCells(line)].map(sanitizeCsvCell).join(",")
          );
        }
      }

      return [headerLine, ...bodyLines].join("\n");
    },

    async importInvoicesCsv({ csvContent, userId }) {
      let records;
      try {
        records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true
        });
      } catch {
        throw Object.assign(new Error("Invalid CSV format"), { status: 400 });
      }

      if (!records.length) {
        return { imported: 0, importedLines: 0, errors: [] };
      }

      const errors = [];
      const groups = new Map();

      records.forEach((row, i) => {
        const rowNum = i + 2;
        const ref = normalizeText(row.sap_invoice_ref);
        if (!ref) {
          errors.push({ row: rowNum, message: "sap_invoice_ref is required" });
          return;
        }
        if (!groups.has(ref)) {
          groups.set(ref, { headerRow: row, headerRowNum: rowNum, lines: [] });
        }
        if (normalizeText(row.material_code)) {
          groups.get(ref).lines.push({ row, rowNum });
        }
      });

      let importedInvoices = 0;
      let importedLines = 0;

      for (const [ref, group] of groups) {
        const header = group.headerRow;
        try {
          const invoice = await adminRepo.upsertInvoice({
            sapInvoiceRef: ref,
            status: normalizeText(header.status).toUpperCase() || "PENDING",
            orderId: normalizeText(header.order_id) || null,
            customerName: normalizeText(header.customer_name) || null,
            customerCode: normalizeText(header.customer_code) || null,
            billingDate: csvDate(header.billing_date),
            billingNumber: normalizeText(header.billing_number) || null,
            division: normalizeText(header.division) || null,
            totalSaleQty: csvNumber(header.total_sale_qty),
            itemTotal: csvInteger(header.item_total),
            totalAmt: csvNumber(header.total_amt),
            transportName: normalizeText(header.transport_name) || null,
            lrNo: normalizeText(header.lr_no) || null,
            lrDate: csvDate(header.lr_date),
            dispatchDate: csvDate(header.dispatch_date),
            deliveryDate: csvDate(header.delivery_date),
            salesOrderQty: csvNumber(header.sales_order_qty),
            podStatus: normalizeText(header.pod_status) || null,
            createdBy: userId
          });
          importedInvoices += 1;

          for (const { row, rowNum } of group.lines) {
            const materialCode = normalizeText(row.material_code).toUpperCase();
            const product = await adminRepo.getProductByCode(materialCode);
            if (!product) {
              errors.push({ row: rowNum, message: `Unknown material code: ${materialCode}` });
              continue;
            }
            const lineNo = csvInteger(row.line_no);
            const billQty = csvInteger(row.bill_qty);
            if (!Number.isInteger(lineNo) || lineNo <= 0) {
              errors.push({ row: rowNum, message: "line_no must be a positive integer" });
              continue;
            }
            if (!Number.isInteger(billQty) || billQty <= 0) {
              errors.push({ row: rowNum, message: "bill_qty must be a positive integer" });
              continue;
            }

            await adminRepo.upsertInvoiceLine({
              invoiceId: invoice.invoiceId,
              lineNo,
              productId: product.productId,
              requiredQuantity: billQty,
              uom: normalizeText(row.uom) || null,
              amount: csvNumber(row.amount),
              podSection: normalizeText(row.pod_section) || null,
              podDocument: normalizeText(row.pod_document) || null,
              createdBy: userId
            });
            importedLines += 1;
          }
        } catch (err) {
          errors.push({ row: group.headerRowNum, message: `${ref}: ${err.message}` });
        }
      }

      return { imported: importedInvoices, importedLines, errors };
    }
  };
}
