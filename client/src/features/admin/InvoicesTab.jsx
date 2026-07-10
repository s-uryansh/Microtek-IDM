import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { downloadCsv } from "../../utils/csv.js";
import { fetchAllInvoices, exportInvoicesCsv, importInvoicesCsv } from "../../api/modules/admin.js";
import { useAuth } from "../../auth/useAuth.js";
import { toArray, fmtDate } from "./adminShared.js";
import { InvoiceFilterBar } from "./InvoiceFilterBar.jsx";
import { InvoiceBulkImportPanel } from "./InvoiceBulkImportPanel.jsx";
import { InvoiceDetailPanel } from "./InvoiceDetailPanel.jsx";

const INVOICE_IMPORT_TEMPLATE = [
  "sap_invoice_ref,status,order_id,customer_name,customer_code,billing_date,billing_number,division,total_sale_qty,item_total,total_amt,transport_name,lr_no,lr_date,dispatch_date,delivery_date,sales_order_qty,pod_status,line_no,material_code,bill_qty,uom,amount,pod_section,pod_document",
  "MTK-INVOICE-DEMO-001,PENDING,SO-DEMO-1,Demo Customer,CUST-9001,2026-06-01,BILL-9001,POWER PRODUCTS,15,1,75951,Bluedart,LR-9001,2026-06-02,2026-06-02,2026-06-05,15,PENDING,1,899-95N-1075,15,NOS,75951,SEC-A,"
].join("\n");

const invoiceColumns = [
  { key: "invoiceId", label: "ID" },
  { key: "sapInvoiceRef", label: "Reference" },
  { key: "orderId", label: "Order ID" },
  { key: "customerName", label: "Customer" },
  { key: "billingNumber", label: "Billing No." },
  { key: "_productSummary", label: "Products", sortable: false },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Uploaded" }
];

function getInvoiceDispatchStatus(inv) {
  const dispatchedQty = Number(inv.dispatchedQty || 0);
  const returnedQty = Number(inv.returnedQty || 0);
  if (dispatchedQty > 0 && returnedQty >= dispatchedQty) return "RETURNED";
  if (returnedQty > 0 && returnedQty < dispatchedQty) return "PARTIAL_RETURN";
  return inv.status || "PENDING";
}

function matchesText(value, query) {
  return String(value ?? "").toLowerCase().includes(query);
}

export function InvoicesTab() {
  const { user, hasPermission } = useAuth();
  const isAdmin = (user?.role || user?.roleCode) === "admin";
  const canExportInvoices = isAdmin || hasPermission?.("invoice:export");
  const [invoices, setInvoices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    customer: "",
    dispatchStatus: "",
    billingNumber: "",
    orderId: ""
  });
  const fileInputRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllInvoices()
      .then((data) => setInvoices(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load invoices"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleExport() {
    try {
      const result = await exportInvoicesCsv();
      downloadCsv("invoices-export.csv", result.csv);
    } catch (err) {
      setError(err?.message || "Export failed");
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  }

  async function handleImport() {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importInvoicesCsv({ csvContent: csvText });
      setImportResult(result);
      load();
      setCsvText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setImportResult({ imported: 0, errors: [{ row: 0, message: err?.message || "Import failed" }] });
    } finally {
      setImporting(false);
    }
  }

  function handleDownloadTemplate() {
    downloadCsv("invoice-import-template.csv", INVOICE_IMPORT_TEMPLATE);
  }

  const invoiceItems = toArray(invoices?.items);
  const customerOptions = [...new Set(invoiceItems.map((inv) => inv.customerName).filter(Boolean))].sort();
  const billingOptions = [...new Set(invoiceItems.map((inv) => inv.billingNumber).filter(Boolean))].sort();
  const orderOptions = [...new Set(invoiceItems.map((inv) => inv.orderId).filter(Boolean))].sort();
  const dispatchStatusOptions = [...new Set(invoiceItems.map((inv) => getInvoiceDispatchStatus(inv)).filter(Boolean))].sort();
  const searchQuery = filters.search.trim().toLowerCase();
  const filteredInvoices = invoiceItems.filter((inv) => {
    if (filters.customer && inv.customerName !== filters.customer) return false;
    if (filters.dispatchStatus && getInvoiceDispatchStatus(inv) !== filters.dispatchStatus) return false;
    if (filters.billingNumber && inv.billingNumber !== filters.billingNumber) return false;
    if (filters.orderId && inv.orderId !== filters.orderId) return false;
    if (!searchQuery) return true;
    return [
      inv.invoiceId,
      inv.sapInvoiceRef,
      inv.orderId,
      inv.customerName,
      inv.customerCode,
      inv.billingNumber,
      inv.status
    ].some((value) => matchesText(value, searchQuery));
  });

  const rows = filteredInvoices.map((inv) => {
    const dispatchedQty = Number(inv.dispatchedQty || 0);
    const returnedQty = Number(inv.returnedQty || 0);
    // All dispatched units returned → show RETURNED instead of DISPATCHED.
    // Some (but not all) returned → keep the status tag + a small returned note.
    const fullyReturned = dispatchedQty > 0 && returnedQty >= dispatchedQty;
    const partialReturn = returnedQty > 0 && returnedQty < dispatchedQty;
    return {
    invoiceId: inv.invoiceId,
    sapInvoiceRef: inv.sapInvoiceRef,
    orderId: inv.orderId || "—",
    customerName: inv.customerName || "—",
    billingNumber: inv.billingNumber || "—",
    status: fullyReturned ? (
      <StatusBadge status="RETURNED" />
    ) : (
      <span style={{ display: "inline-flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap" }}>
        <StatusBadge status={inv.status} />
        {partialReturn && (
          <span
            className="status-badge status-badge--returned"
            style={{ fontSize: "0.6875rem" }}
            title={`${returnedQty} of ${dispatchedQty} dispatched unit(s) returned`}
          >
            ↩ {returnedQty} returned
          </span>
        )}
      </span>
    ),
    createdAt: fmtDate(inv.uploadedDate || inv.createdAt),
    _productSummary: (
      <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {inv.lines?.length || 0} line{(inv.lines?.length || 0) !== 1 ? "s" : ""}
      </span>
    ),
    _invoice: inv,
    _lines: inv.lines || []
    };
  });

  const displayColumns = [...invoiceColumns];

  return (
    <div>
      <div style={{ marginTop: "var(--space-4)" }}>
        <Card title="All Invoices">
          <InvoiceFilterBar
            filters={filters}
            updateFilter={updateFilter}
            customerOptions={customerOptions}
            billingOptions={billingOptions}
            orderOptions={orderOptions}
            dispatchStatusOptions={dispatchStatusOptions}
            canExportInvoices={canExportInvoices}
            onExport={handleExport}
            onClearFilters={() => setFilters({ search: "", customer: "", dispatchStatus: "", billingNumber: "", orderId: "" })}
          />
          <DataTable
            columns={displayColumns}
            data={rows}
            loading={loading}
            error={error}
            onRetry={load}
            pageSize={15}
            sortable={true}
            onRowClick={(row) => setExpanded(expanded === row.invoiceId ? null : row.invoiceId)}
          />
        </Card>
      </div>

      {isAdmin && (
        <InvoiceBulkImportPanel
          fileInputRef={fileInputRef}
          csvText={csvText}
          importing={importing}
          importResult={importResult}
          onFileUpload={handleFileUpload}
          onImport={handleImport}
          onDownloadTemplate={handleDownloadTemplate}
        />
      )}

      {expanded && (
        <div style={{ marginTop: "var(--space-4)" }}>
          {rows
            .filter((r) => r.invoiceId === expanded)
            .map((row) => (
              <InvoiceDetailPanel key={row.invoiceId} row={row} />
            ))}
        </div>
      )}
    </div>
  );
}
