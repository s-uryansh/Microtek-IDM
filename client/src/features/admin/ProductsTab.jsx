import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { Collapsible } from "../../components/ui/Collapsible.jsx";
import { downloadCsv } from "../../utils/csv.js";
import { fetchProducts, importProductsCsv, exportProductsCsv } from "../../api/modules/admin.js";
import { toArray, orNA, fmtNumberPlain } from "./adminShared.js";

const PRODUCT_IMPORT_TEMPLATE = [
  "Product Code(*),Product Name(*),Category(*),Sub Category(*),Distributor Price,Warraanty,Gst,Mrp,Base Price,Stock,SBU,Poll,MOQ,Description,Product Category",
  "SPGS4050S2204P6252,SPGS-PWM4050-MS2206024TT4N-P625BW2N,PSD,SPGS,1000,36 months,18,1900,600,,SBU06,4,500,SPGS-PWM4050-MS2206024TT4N-P625BW2N,PSD"
].join("\n");

function SerialNumbersCell({ value }) {
  const [expanded, setExpanded] = useState(false);
  const serials = toArray(value);

  if (!serials.length) return orNA(null);

  // Few serials read fine inline — no toggle needed.
  if (serials.length <= 2) {
    return <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{serials.join(", ")}</span>;
  }

  return (
    <div style={{ minWidth: "9rem" }}>
      <button
        type="button"
        className="badge"
        aria-expanded={expanded}
        onClick={(event) => {
          event.stopPropagation();
          setExpanded((open) => !open);
        }}
        style={{ border: "none", cursor: "pointer", gap: "var(--space-1)" }}
      >
        {serials.length} serials {expanded ? "▴" : "▾"}
      </button>
      {expanded && (
        <ul
          style={{
            margin: "var(--space-2) 0 0",
            padding: 0,
            listStyle: "none",
            maxHeight: "12rem",
            overflowY: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            lineHeight: 1.6,
            color: "var(--color-text-secondary)"
          }}
        >
          {serials.map((serial, index) => (
            <li key={`${serial}-${index}`}>{serial}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const productColumns = [
  { key: "productCode", label: "Code" },
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub Category" },
  { key: "productCategory", label: "Product Category" },
  { key: "distributorPrice", label: "Distributor Price" },
  { key: "basePrice", label: "Base Price" },
  { key: "mrp", label: "MRP" },
  { key: "gst", label: "GST %" },
  { key: "warranty", label: "Warranty" },
  { key: "moq", label: "MOQ" },
  { key: "stock", label: "Stock" },
  { key: "sbu", label: "SBU" },
  { key: "poll", label: "Poll" },
  { key: "description", label: "Description" },
  {
    key: "serialNumbers",
    label: "Serial Numbers",
    // Serials are free-text (many per product), so keep them out of the filter
    // dropdown — the DataTable's free-text search still spans this column.
    filterable: false,
    sortable: false,
    render: (value) => <SerialNumbersCell value={value} />,
    filterValue: (row) => toArray(row.serialNumbers).join(" ")
  },
  { key: "isBattery", label: "Battery" },
  { key: "isActive", label: "Active" }
];

export function ProductsTab() {
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchProducts()
      .then((data) => setProducts(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load products"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    try {
      const result = await exportProductsCsv();
      downloadCsv("products-export.csv", result.csv);
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
      const result = await importProductsCsv({ csvContent: csvText });
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
    downloadCsv("product-import-template.csv", PRODUCT_IMPORT_TEMPLATE);
  }

  const rows = toArray(products?.items).map((p) => ({
    ...p,
    subCategory: orNA(p.subCategory),
    productCategory: orNA(p.productCategory),
    distributorPrice: fmtNumberPlain(p.distributorPrice),
    basePrice: fmtNumberPlain(p.basePrice),
    mrp: fmtNumberPlain(p.mrp),
    gst: fmtNumberPlain(p.gst),
    moq: fmtNumberPlain(p.moq),
    stock: fmtNumberPlain(p.stock),
    warranty: orNA(p.warranty),
    sbu: orNA(p.sbu),
    poll: orNA(p.poll),
    description: orNA(p.description),
    isBattery: p.isBattery ? "Yes" : "No",
    isActive: p.isActive ? "Yes" : "No"
  }));

  return (
    <div>
      <Card title="Product List">
        <DataTable
          columns={productColumns}
          data={rows}
          loading={loading}
          error={error}
          onRetry={load}
          pageSize={10}
          sortable={true}
        />
      </Card>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Collapsible title="Import / Export Products" openLabel="Import / Export Products" closeLabel="Hide Import / Export">
          <Card title="Import Template">
            <div className="scan-workflow-form" style={{ maxWidth: 640 }}>
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
                Use this CSV structure for product imports.
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: "var(--space-3)",
                  backgroundColor: "var(--color-surface-subtle)",
                  borderRadius: "var(--radius-md)",
                  overflowX: "auto",
                  fontSize: "0.8125rem"
                }}
              >
                {PRODUCT_IMPORT_TEMPLATE}
              </pre>
              <Button variant="secondary" onClick={handleDownloadTemplate}>
                Download Template
              </Button>
            </div>
          </Card>

          <div style={{ marginTop: "var(--space-4)" }}>
            <Card title="Import / Export Products">
              <div className="scan-workflow-form" style={{ maxWidth: 500 }}>
                <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end" }}>
                  <Button variant="secondary" onClick={handleExport}>
                    Export CSV
                  </Button>
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
                      {importing ? "Importing..." : "Import Products"}
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
                    <p>Imported: {importResult.imported} products</p>
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
          </div>
        </Collapsible>
      </div>
    </div>
  );
}
