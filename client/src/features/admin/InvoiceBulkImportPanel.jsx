import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Collapsible } from "../../components/ui/Collapsible.jsx";

export function InvoiceBulkImportPanel({
  fileInputRef,
  csvText,
  importing,
  importResult,
  onFileUpload,
  onImport,
  onDownloadTemplate
}) {
  return (
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
        <Button variant="secondary" onClick={onDownloadTemplate}>
          Download Template
        </Button>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={onFileUpload}
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
            <Button onClick={onImport} disabled={importing}>
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
  );
}
