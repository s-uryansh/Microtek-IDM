import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { BulkCsvTools } from "../../components/operations/BulkCsvTools.jsx";
import { listBatches, getBatch, importProduction, fetchAgeingSummary } from "../../api/modules/importMonitor.js";

const TABS = [
  { key: "history", label: "Import History" },
  { key: "manual", label: "Manual Import" },
  { key: "ageing", label: "Ageing Summary" }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatTimestamp(iso) {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ImportHistoryTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listBatches({ limit: 50 });
      setBatches(result.batches || []);
    } catch (err) {
      setError(err?.message || "Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  async function handleRowClick(row) {
    setDetailLoading(true);
    setSelectedBatch(row);
    setBatchDetail(null);
    try {
      const detail = await getBatch(row.batchId);
      setBatchDetail(detail);
    } catch (err) {
      setBatchDetail({ rejections: [], error: err?.message || "Failed to load details" });
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDrawer() {
    setSelectedBatch(null);
    setBatchDetail(null);
  }

  const columns = [
    { key: "batchId", label: "Batch ID" },
    { key: "sourceLabel", label: "Source" },
    { key: "importedAt", label: "Imported At", render: (v) => formatTimestamp(v) },
    { key: "importedCount", label: "Imported" },
    { key: "rejectedCount", label: "Rejected" },
    { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> }
  ];

  if (batches.length === 0 && !loading && !error) {
    return (
      <div>
        <Card>
          <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
            <p>No import batches found.</p>
            <Button variant="secondary" onClick={loadBatches} style={{ marginTop: "var(--space-4)" }}>
              Refresh
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <Button variant="secondary" onClick={loadBatches} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={batches}
          loading={loading}
          error={error}
          onRetry={loadBatches}
          onRowClick={handleRowClick}
          emptyTitle="No import batches"
          emptyDescription="Batches appear here after production imports."
        />
      </Card>

      {selectedBatch && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "flex-end"
          }}
          onClick={closeDrawer}
        >
          <div
            style={{
              width: "min(500px, 90vw)",
              backgroundColor: "var(--color-bg)",
              padding: "var(--space-6)",
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
              <h3>Batch #{selectedBatch.batchId}</h3>
              <Button variant="ghost" onClick={closeDrawer}>Close</Button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
              <div>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Source</p>
                <p>{selectedBatch.sourceLabel || "--"}</p>
              </div>
              <div>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Status</p>
                <StatusBadge status={selectedBatch.status} />
              </div>
              <div>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Imported</p>
                <p>{safeNumber(selectedBatch.importedCount)}</p>
              </div>
              <div>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Rejected</p>
                <p>{safeNumber(selectedBatch.rejectedCount)}</p>
              </div>
            </div>

            <h4 style={{ marginBottom: "var(--space-2)" }}>Rejected Rows</h4>
            {detailLoading ? (
              <p>Loading...</p>
            ) : !batchDetail || !batchDetail.rejections || batchDetail.rejections.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>No rejections.</p>
            ) : (
              <table style={{ width: "100%", fontSize: "0.8125rem" }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: "var(--space-1)" }}>Row</th>
                    <th style={{ padding: "var(--space-1)" }}>Serial</th>
                    <th style={{ padding: "var(--space-1)" }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {batchDetail.rejections.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: "var(--space-1)", fontFamily: "var(--font-mono)" }}>{r.index}</td>
                      <td style={{ padding: "var(--space-1)", fontFamily: "var(--font-mono)" }}>{r.serialNo}</td>
                      <td style={{ padding: "var(--space-1)", color: "var(--color-warning)" }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {batchDetail?.rejections?.length > 0 && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <BulkCsvTools
                  title="Export Rejections"
                  exportLabel="Download Rejected CSV"
                  exportFilename={`batch-${selectedBatch.batchId}-rejections.csv`}
                  exportHeaders={["index", "serialNo", "reason"]}
                  exportRows={batchDetail.rejections.map((r) => ({
                    index: r.index,
                    serialNo: r.serialNo,
                    reason: r.reason
                  }))}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ManualImportTab() {
  const [externalRef, setExternalRef] = useState("");
  const [source, setSource] = useState("SAP");
  const [serialInput, setSerialInput] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [inputMode, setInputMode] = useState("text");

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

  function parseJsonRecords(text) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Expected an array");
      return parsed;
    } catch (e) {
      throw new Error(`Invalid JSON: ${e.message}`);
    }
  }

  async function handleImport() {
    setError(null);
    setResult(null);
    let records;
    if (inputMode === "json") {
      try {
        records = parseJsonRecords(serialInput);
      } catch (e) {
        setError(e.message);
        return;
      }
    } else {
      records = parseRecords();
    }
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

  const rejectedRows = toArray(result?.rejectedRows);

  return (
    <div>
      <Card title="Production Import">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 640 }}>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button
              variant={inputMode === "text" ? "primary" : "secondary"}
              onClick={() => setInputMode("text")}
              size="sm"
            >
              CSV Input
            </Button>
            <Button
              variant={inputMode === "json" ? "primary" : "secondary"}
              onClick={() => setInputMode("json")}
              size="sm"
            >
              JSON Input
            </Button>
          </div>
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
              {inputMode === "json"
                ? "JSON Array (e.g. [{\"serialNo\":\"...\",\"productCode\":\"...\"}])"
                : "Serial Records (one per line: serialNo,productCode,batchNo,warehouseId)"}
            </label>
            <textarea
              id="import-records"
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
              className="input"
              rows={6}
              placeholder={inputMode === "json"
                ? '[{"serialNo":"DEMO-MANUAL-A001","productCode":"SKU-INV-1","batchNo":"BATCH-01","warehouseId":3}]'
                : "DEMO-MANUAL-A001,SKU-INV-1,BATCH-01,3\nDEMO-MANUAL-A002,SKU-BAT-1,BATCH-01,3"}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                <div>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Batch ID</p>
                  <p style={{ fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                    {result.batchId ?? "--"}
                  </p>
                </div>
                <div>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Source</p>
                  <p style={{ fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                    {result.sourceLabel ?? "--"}
                  </p>
                </div>
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
              <div>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Imported At</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
                  {formatTimestamp(result.importedAt)}
                </p>
              </div>
              {rejectedRows.length > 0 && (
                <div style={{ marginTop: "var(--space-3)" }}>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginBottom: "var(--space-2)" }}>
                    Rejected Rows:
                  </p>
                  <table style={{ width: "100%", fontSize: "0.8125rem" }}>
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        <th style={{ padding: "var(--space-1)" }}>Index</th>
                        <th style={{ padding: "var(--space-1)" }}>Serial No</th>
                        <th style={{ padding: "var(--space-1)" }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedRows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ padding: "var(--space-1)", fontFamily: "var(--font-mono)" }}>{r?.index}</td>
                          <td style={{ padding: "var(--space-1)", fontFamily: "var(--font-mono)" }}>{r?.serialNo}</td>
                          <td style={{ padding: "var(--space-1)", color: "var(--color-warning)" }}>{r?.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <BulkCsvTools
                    title="Rejected Rows"
                    exportLabel="Download Rejected CSV"
                    exportFilename="production-import-rejections.csv"
                    exportHeaders={["index", "serialNo", "reason"]}
                    exportRows={rejectedRows}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function AgeingSummaryTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAgeingSummary();
      setSummary(result);
    } catch (err) {
      setError(err?.message || "Failed to load ageing summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const bucketLabels = summary?.warehouses?.[0]?.buckets
    ? Object.keys(summary.warehouses[0].buckets)
    : [];

  return (
    <div>
      <Card title="Ageing Summary by Warehouse">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <Button variant="secondary" onClick={loadSummary} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
        {error && (
          <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>
        )}
        {loading && !summary && (
          <p>Loading ageing summary...</p>
        )}
        {summary && summary.warehouses && summary.warehouses.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table__table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Warehouse</th>
                  {bucketLabels.map((label) => (
                    <th key={label} className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>
                      {label}
                    </th>
                  ))}
                  <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.warehouses.map((wh) => (
                  <tr key={wh.warehouseId} className="data-table__row">
                    <td style={{ padding: "var(--space-2)", fontWeight: 600 }}>
                      {wh.warehouseCode || `WH-${wh.warehouseId}`}
                    </td>
                    {bucketLabels.map((label) => (
                      <td key={label} style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {wh.buckets[label] ?? 0}
                      </td>
                    ))}
                    <td style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {wh.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary && (!summary.warehouses || summary.warehouses.length === 0) && (
          <p style={{ color: "var(--color-text-muted)" }}>No ageing data available.</p>
        )}
        {summary?.asOf && (
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
            As of: {formatTimestamp(summary.asOf)}
          </p>
        )}
      </Card>
    </div>
  );
}

export function ImportMonitorPage() {
  const [activeTab, setActiveTab] = useState("history");

  return (
    <div>
      <PageHeader title="SAP Import Monitor" subtitle="Track inbound integration batches and ageing data" />

      <div
        style={{
          padding: "var(--space-4)",
          marginBottom: "var(--space-4)",
          backgroundColor: "var(--color-warning-bg, #fff8e1)",
          border: "1px solid var(--color-warning-border, #ffe082)",
          borderRadius: "var(--radius-md)",
          fontSize: "0.875rem",
          lineHeight: 1.5
        }}
        role="status"
      >
        <strong>Status:</strong> SAP adapter not connected — imports are manual.
        When OI-7 is resolved, point the SAP adapter to{" "}
        <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>POST /api/idm-01/import/production</code>
        {" "}with <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>X-IDM-Signature</code> and{" "}
        <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>X-Import-Source</code> headers.
      </div>

      <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted)",
              fontSize: "0.875rem"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "history" && <ImportHistoryTab />}
      {activeTab === "manual" && <ManualImportTab />}
      {activeTab === "ageing" && <AgeingSummaryTab />}
    </div>
  );
}
