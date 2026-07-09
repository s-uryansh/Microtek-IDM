import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { Collapsible } from "../../components/ui/Collapsible.jsx";
import { downloadCsv } from "../../utils/csv.js";
import { fetchAllInvoices, exportInvoicesCsv, importInvoicesCsv } from "../../api/modules/admin.js";
import { useAuth } from "../../auth/useAuth.js";
import { toArray, fmtDate, orNA, fmtNumberPlain } from "./adminShared.js";

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

function fmtDateTime(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  const date = d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(/ /g, "-");
  const time = d.toLocaleTimeString("en-GB", { hour12: false });
  return `${date} , ${time}`;
}

function fmtLrNoAndDate(lrNo, lrDate) {
  if (lrNo && lrDate) return `${lrNo} / ${lrDate}`;
  return lrNo || lrDate || "N/A";
}

/* Display-only POD Document panel (matches the reference layout). Upload is not
   wired up yet — the edit button just surfaces that it's coming. */
function PodDocumentBox() {
  const [showNote, setShowNote] = useState(false);
  return (
    <Card title="POD Document">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
        <Button variant="secondary" size="sm" onClick={() => setShowNote(true)} aria-label="Edit POD document">
          ✎
        </Button>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "var(--space-6) 0", margin: 0 }}>
        Currently No Document Found...
      </p>
      {showNote && (
        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          Document upload isn’t enabled yet.
        </p>
      )}
    </Card>
  );
}

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
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-end", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <Input
                label="Search Invoices"
                value={filters.search}
                onChange={(value) => updateFilter("search", value)}
                placeholder="Invoice ref, ID, order ID, customer name..."
              />
            </div>
            {canExportInvoices && (
              <Button variant="secondary" onClick={handleExport}>
                Export CSV
              </Button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-customer">Customer</label>
              <select
                id="invoice-filter-customer"
                className="input"
                value={filters.customer}
                onChange={(e) => updateFilter("customer", e.target.value)}
              >
                <option value="">All customers</option>
                {customerOptions.map((customer) => (
                  <option key={customer} value={customer}>{customer}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-dispatch-status">Dispatch Status</label>
              <select
                id="invoice-filter-dispatch-status"
                className="input"
                value={filters.dispatchStatus}
                onChange={(e) => updateFilter("dispatchStatus", e.target.value)}
              >
                <option value="">All statuses</option>
                {dispatchStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-billing">Billing Number</label>
              <select
                id="invoice-filter-billing"
                className="input"
                value={filters.billingNumber}
                onChange={(e) => updateFilter("billingNumber", e.target.value)}
              >
                <option value="">All billing numbers</option>
                {billingOptions.map((billingNumber) => (
                  <option key={billingNumber} value={billingNumber}>{billingNumber}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-order">Order ID</label>
              <select
                id="invoice-filter-order"
                className="input"
                value={filters.orderId}
                onChange={(e) => updateFilter("orderId", e.target.value)}
              >
                <option value="">All order IDs</option>
                {orderOptions.map((orderId) => (
                  <option key={orderId} value={orderId}>{orderId}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button
                variant="secondary"
                onClick={() => setFilters({ search: "", customer: "", dispatchStatus: "", billingNumber: "", orderId: "" })}
              >
                Clear Filters
              </Button>
            </div>
          </div>
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
        <div style={{ marginTop: "var(--space-4)" }}>
        <Collapsible
          title="Invoice Bulk CSV"
          openLabel="Invoice Bulk CSV (Admin only)"
          closeLabel="Hide Invoice Bulk CSV"
        >
        <Card title="Invoice Bulk CSV (Admin only)">
          <div className="scan-workflow-form" style={{ maxWidth: 640 }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
              Import invoices in bulk. One CSV row per invoice line; invoice header
              columns repeat for each line of the same <code>sap_invoice_ref</code>.
            </p>
            <Button variant="secondary" onClick={handleDownloadTemplate}>
              Download Template
            </Button>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Choose CSV File
              </Button>
            </div>
            {csvText && (
              <div>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                  File loaded ({csvText.length} chars). Click Import to process.
                </p>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? "Importing..." : "Import Invoices"}
                </Button>
              </div>
            )}
            {importResult && (
              <div
                style={{
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor:
                    importResult.errors?.length > 0
                      ? "var(--color-warning-subtle)"
                      : "var(--color-success-subtle)",
                  fontSize: "0.875rem"
                }}
              >
                <p>
                  Imported: {importResult.imported} invoice{importResult.imported !== 1 ? "s" : ""}
                  {importResult.importedLines !== undefined ? `, ${importResult.importedLines} line items` : ""}
                </p>
                {importResult.errors?.length > 0 && (
                  <div style={{ marginTop: "var(--space-2)" }}>
                    <p style={{ fontWeight: 600 }}>Errors:</p>
                    {importResult.errors.map((err, i) => (
                      <p key={i} style={{ color: "var(--color-error)", fontSize: "0.8125rem" }}>
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
        </Collapsible>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: "var(--space-4)" }}>
          {rows
            .filter((r) => r.invoiceId === expanded)
            .map((row) => {
              const inv = row._invoice;
              const basicInfo = [
                ["Uploaded Date", fmtDateTime(inv.uploadedDate || inv.createdAt)],
                ["Order ID", orNA(inv.orderId)],
                ["Customer Name", orNA(inv.customerName)],
                ["Customer Code", orNA(inv.customerCode)],
                ["Billing Date", orNA(inv.billingDate)],
                ["Billing Number", orNA(inv.billingNumber)],
                ["Division", orNA(inv.division)],
                ["Total Sale QTY", fmtNumberPlain(inv.totalSaleQty)],
                ["Item Total", fmtNumberPlain(inv.itemTotal)],
                ["Total Amt", fmtNumberPlain(inv.totalAmt)],
                ["Transport Name", orNA(inv.transportName)],
                ["LR no and Date", fmtLrNoAndDate(inv.lrNo, inv.lrDate)],
                ["Dispatch Date", orNA(inv.dispatchDate)],
                ["Delivery Date", orNA(inv.deliveryDate)],
                ["Sales Order QTY", fmtNumberPlain(inv.salesOrderQty)],
                ["POD Status", orNA(inv.podStatus)]
              ];
              return (
                <div key={row.invoiceId}>
                  <Card title={`Invoice #${row.invoiceId} — Basic Information`}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "var(--space-3)"
                      }}
                    >
                      {basicInfo.map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{label}</div>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <div style={{ marginTop: "var(--space-4)" }}>
                    <Card title="Item Information">
                      <table className="data-table__table" style={{ width: "100%" }}>
                        <thead>
                          <tr>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>S.No.</th>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Material Name</th>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Material Code</th>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Category</th>
                            <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Bill QTY</th>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>UOM</th>
                            <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Amount</th>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Numbers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row._lines.length === 0 && (
                            <tr className="data-table__row">
                              <td colSpan={8} style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--color-text-muted)" }}>
                                No line items
                              </td>
                            </tr>
                          )}
                          {row._lines.flatMap((line) => {
                            const serials = Array.isArray(line.serialNos) ? line.serialNos : [];
                            const returnedSet = new Set(Array.isArray(line.returnedSerialNos) ? line.returnedSerialNos : []);
                            const rowCount = Math.max(serials.length, 1);
                            return Array.from({ length: rowCount }).map((_, serialIndex) => (
                              <tr key={`${line.invoiceLineId}-${serials[serialIndex] || serialIndex}`} className="data-table__row">
                                {serialIndex === 0 && (
                                  <>
                                    <td rowSpan={rowCount} style={{ padding: "var(--space-2)" }}>{line.lineNo}</td>
                                    <td rowSpan={rowCount} style={{ padding: "var(--space-2)", fontWeight: 600 }}>{line.productName}</td>
                                    <td rowSpan={rowCount} style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                                      {line.productCode}
                                    </td>
                                    <td rowSpan={rowCount} style={{ padding: "var(--space-2)" }}>
                                      <span className="badge">{line.category || line.segment || "—"}</span>
                                    </td>
                                    <td rowSpan={rowCount} style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                      {Number(line.quantity).toFixed(3)}
                                    </td>
                                    <td rowSpan={rowCount} style={{ padding: "var(--space-2)" }}>{line.uom || "—"}</td>
                                    <td rowSpan={rowCount} style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                      {fmtNumberPlain(line.amount)}
                                    </td>
                                  </>
                                )}
                                <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                                  {serials[serialIndex] || "—"}
                                  {serials[serialIndex] && returnedSet.has(serials[serialIndex]) && (
                                    <span
                                      className="status-badge status-badge--returned"
                                      style={{ marginLeft: "var(--space-2)", fontSize: "0.6875rem", fontFamily: "var(--font-sans)" }}
                                    >
                                      returned
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </Card>
                  </div>

                  <div style={{ marginTop: "var(--space-4)" }}>
                    <PodDocumentBox />
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
