import { useRef, useState } from "react";

import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { importProductionCsv } from "../../api/modules/imports.js";

const CSV_TEMPLATE =
  "serialNo,productCode,batchNo,sourceWarehouseId,destinationWarehouseId,sourceInvoiceRef\n" +
  "MTK1234567890,MTK-INVERTER-1KVA,B-01,1,3,INV-1001\n";

export function ImportProductionPage() {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [source, setSource] = useState("CSV");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function handleDownloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "idm-01-production-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    setResult(null);
    setError(null);
    if (!file) {
      setCsvText("");
      setFileName("");
      return;
    }
    setFileName(file.name);
    setCsvText(await file.text());
  }

  async function handleImport() {
    if (!csvText.trim() || !externalRef.trim() || importing) return;
    setImporting(true);
    setResult(null);
    setError(null);
    try {
      const response = await importProductionCsv({
        csvContent: csvText,
        externalRef: externalRef.trim(),
        source: source.trim() || "CSV",
        sourceLabel: fileName || "csv-upload"
      });
      setResult(response);
      setCsvText("");
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err?.body?.error?.message || err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const rejectedRows = Array.isArray(result?.rejectedRows) ? result.rejectedRows : [];

  return (
    <div className="import-production">
      <PageHeader
        title="Import Production Batch"
        subtitle="Upload a CSV of factory-produced serials (alternative to the SAP production API)"
      />

      <Card title="How serials enter IDM-01">
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
          Production serials reach IDM-01 one of two ways:
        </p>
        <ul style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
          <li><strong>SAP production API</strong> — SAP POSTs a signed JSON batch to <code>/api/idm-01/import/production</code>.</li>
          <li><strong>CSV upload</strong> — a permitted user uploads a CSV here. Both paths run the same validation and de-duplication.</li>
        </ul>
      </Card>

      <Card title="Upload CSV">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "32rem" }}>
          <Input
            label="Batch reference (externalRef)"
            value={externalRef}
            onChange={setExternalRef}
            placeholder="e.g. SAP-PROD-2026-06-001"
          />

          <Input label="Source" value={source} onChange={setSource} placeholder="CSV" />

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Choose CSV file
            </Button>
            <Button variant="ghost" onClick={handleDownloadTemplate}>
              Download CSV template
            </Button>
            {fileName && (
              <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                {fileName} ({csvText.length} chars)
              </span>
            )}
          </div>

          <Button onClick={handleImport} disabled={importing || !csvText.trim() || !externalRef.trim()}>
            {importing ? "Importing…" : "Import batch"}
          </Button>

          <details>
            <summary style={{ fontSize: "0.8125rem", cursor: "pointer" }}>Expected CSV columns</summary>
            <pre style={{ fontSize: "0.75rem", overflowX: "auto", background: "var(--color-surface-muted, #f5f5f5)", padding: "0.5rem", borderRadius: "0.375rem" }}>
{CSV_TEMPLATE}
            </pre>
          </details>
        </div>
      </Card>

      {error && (
        <Card title="Import failed">
          <p style={{ color: "var(--color-error)", fontSize: "0.875rem", margin: 0 }}>{error}</p>
        </Card>
      )}

      {result && (
        <Card title="Import result">
          <p style={{ fontSize: "0.875rem", margin: 0 }}>
            Status: <strong>{result.status}</strong> · Imported: <strong>{result.importedCount}</strong> · Rejected:{" "}
            <strong>{result.rejectedCount}</strong> · Batch #{result.batchId}
          </p>
          {rejectedRows.length > 0 && (
            <table style={{ width: "100%", marginTop: "0.75rem", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "0.25rem 0.5rem" }}>Row</th>
                  <th style={{ padding: "0.25rem 0.5rem" }}>Serial</th>
                  <th style={{ padding: "0.25rem 0.5rem" }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rejectedRows.map((row) => (
                  <tr key={`${row.index}-${row.serialNo}`}>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{row.index}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{row.serialNo || "—"}</td>
                    <td style={{ padding: "0.25rem 0.5rem", color: "var(--color-error)" }}>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
