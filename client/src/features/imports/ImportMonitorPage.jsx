import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { BulkCsvTools } from "../../components/operations/BulkCsvTools.jsx";
import { importProduction } from "../../api/modules/imports.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function ImportMonitorPage() {
  const [externalRef, setExternalRef] = useState("");
  const [source, setSource] = useState("SAP");
  const [serialInput, setSerialInput] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);

  function parseRecords() {
    return serialInput
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(",").map((p) => p.trim());
        return {
          serialNo: parts[0],
          productCode: parts[1] || "SKU-INV-1",
          batchNo: parts[2] || undefined,
          warehouseId: parts[3] ? Number(parts[3]) : undefined
        };
      });
  }

  async function handleImport() {
    setError(null);
    setResult(null);
    const records = parseRecords();
    if (records.length === 0) {
      setError("Enter at least one serial record");
      return;
    }
    setImporting(true);
    try {
      const res = await importProduction({ externalRef, source, records });
      setResult(res);
    } catch (err) {
      setError(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const rejections = toArray(result?.rejections);

  return (
    <div>
      <PageHeader title="Import Monitor" subtitle="Track SAP data imports" />
      <Card title="Production Import">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 640 }}>
          <Input
            label="External Reference"
            value={externalRef}
            onChange={setExternalRef}
            placeholder="e.g. SAP-PROD-001"
          />
          <Input
            label="Source"
            value={source}
            onChange={setSource}
            placeholder="e.g. SAP"
          />
          <div>
            <label
              className="input__label"
              style={{ display: "block", marginBottom: "var(--space-2)" }}
              htmlFor="import-records"
            >
              Serial Records (one per line: serialNo,productCode,batchNo,warehouseId)
            </label>
            <textarea
              id="import-records"
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
              className="input"
              rows={6}
              placeholder={"DEMO-MANUAL-A001,SKU-INV-1,BATCH-01,3\nDEMO-MANUAL-A002,SKU-BAT-1,BATCH-01,3"}
              style={{
                width: "100%",
                resize: "vertical",
                fontFamily: "var(--font-mono)",
                fontSize: "0.875rem"
              }}
            />
          </div>
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleImport} disabled={!externalRef || !serialInput.trim() || importing}>
            {importing ? "Importing..." : "Import Production Serials"}
          </Button>
          <BulkCsvTools
            title="Production Import CSV"
            templateFilename="production-import-template.csv"
            templateHeaders={["serialNo", "productCode", "batchNo", "warehouseId"]}
            exportLabel="Export Rejections"
            exportFilename="production-import-rejections.csv"
            exportHeaders={["index", "serialNo", "reason"]}
            exportRows={rejections}
          />

          {result && (
            <div
              style={{
                padding: "var(--space-4)",
                backgroundColor: "var(--color-bg-surface)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginBottom: "var(--space-3)"
                }}
              >
                <StatusBadge status={result.status || "UNKNOWN"} />
                <span style={{ fontWeight: 600 }}>{result.status || "UNKNOWN"}</span>
              </div>
              <div style={{ display: "flex", gap: "var(--space-6)" }}>
                <div>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Imported</p>
                  <p style={{ fontSize: "1.25rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                    {safeNumber(result.importedCount)}
                  </p>
                </div>
                <div>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Rejected</p>
                  <p style={{ fontSize: "1.25rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                    {safeNumber(result.rejectedCount)}
                  </p>
                </div>
              </div>
              {rejections.length > 0 && (
                <div style={{ marginTop: "var(--space-3)" }}>
                  <p
                    style={{
                      color: "var(--color-text-muted)",
                      fontSize: "0.75rem",
                      marginBottom: "var(--space-2)"
                    }}
                  >
                    Rejections:
                  </p>
                  {rejections.map((r, i) => (
                    <p
                      key={i}
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--color-warning)",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      #{r?.index}: {r?.serialNo ?? "—"} — {r?.reason ?? "Unknown"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
