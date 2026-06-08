import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { BulkCsvTools } from "../../components/operations/BulkCsvTools.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { fetchSerialHistory } from "../../api/modules/history.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatTimestamp(iso) {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
}

export function SerialHistoryPage() {
  const [serialNo, setSerialNo] = useState("");
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);

  async function loadHistory(value) {
    const lookupSerial = String(value || "").trim();
    if (!lookupSerial) return null;
    const result = await fetchSerialHistory({ serialNo: lookupSerial });
    const rows = toArray(result?.timeline).map((item) => ({
      serial_no: result?.serial?.serialNo || lookupSerial,
      type: item.type,
      at: item.at,
      eventType: item.eventType,
      ruleCode: item.ruleCode,
      referenceType: item.referenceType,
      referenceId: item.referenceId,
      warehouseId: item.warehouseId,
      status: item.status
    }));
    setHistoryRows((prev) => [...prev, ...rows]);
    return result;
  }

  async function handleSearch() {
    if (!serialNo.trim()) return;
    setError(null);
    setHistory(null);
    setLoading(true);
    try {
      const result = await loadHistory(serialNo);
      setHistory(result);
    } catch (err) {
      if (err?.status === 404) {
        setHistory({ found: false, serial: null, timeline: [] });
        return;
      }
      setError(err?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleScanSerial(value) {
    try {
      const result = await loadHistory(value);
      setSerialNo(String(value || "").trim());
      setHistory(result);
      return { status: "FOUND", message: "Serial timeline loaded", state: "success" };
    } catch (err) {
      if (err?.status === 404) {
        return { status: "NOT_FOUND", message: "Serial not found", state: "error" };
      }
      throw err;
    }
  }

  const timeline = toArray(history?.timeline);

  return (
    <div>
      <PageHeader title="Serial History" subtitle="Track serial number lifecycle" />
      <Card title="Serial Lookup">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 480 }}>
          <Input
            label="Serial Number"
            value={serialNo}
            onChange={setSerialNo}
            placeholder="Enter serial number"
          />
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleSearch} disabled={!serialNo.trim() || loading}>
            {loading ? "Searching..." : "Search"}
          </Button>
          <ScanSession
            module="HISTORY"
            title="Serial scanner"
            scannerLabel="Scan Serial"
            placeholder="Scan or enter serial number"
            onScan={handleScanSerial}
          />
          <BulkCsvTools
            title="Serial History CSV"
            templateFilename="serial-history-import-template.csv"
            templateHeaders={["serial_no"]}
            importLabel="Import Serials"
            exportLabel="Export Timeline Results"
            exportFilename="serial-history-results.csv"
            exportHeaders={["serial_no", "type", "at", "eventType", "ruleCode", "referenceType", "referenceId", "warehouseId", "status"]}
            exportRows={historyRows}
            onImportRow={(row) => handleScanSerial(row.serial_no)}
          />
        </div>
      </Card>

      {history?.found && (
        <Card title={`Serial: ${history?.serial?.serialNo ?? serialNo}`} style={{ marginTop: "var(--space-4)" }}>
          <BulkCsvTools
            title="Serial Timeline Export"
            templateFilename="serial-history-template.csv"
            templateHeaders={["type", "at", "eventType", "ruleCode", "referenceType", "referenceId", "warehouseId", "status"]}
            exportLabel="Export Timeline"
            exportFilename={`serial-${history?.serial?.serialNo ?? serialNo}-timeline.csv`}
            exportHeaders={["serial_no", "type", "at", "eventType", "ruleCode", "referenceType", "referenceId", "warehouseId", "status"]}
            exportRows={timeline.map((item) => ({ serial_no: history?.serial?.serialNo ?? serialNo, ...item }))}
          />
          <p style={{ marginBottom: "var(--space-4)", color: "var(--color-text-secondary)" }}>
            Current Status: <StatusBadge status={history?.serial?.currentStatus ?? "UNKNOWN"} />
          </p>
          {timeline.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)" }}>No history events recorded for this serial.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {timeline.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    backgroundColor: "var(--color-bg-surface)",
                    borderRadius: "var(--radius-md)",
                    borderLeft: `3px solid ${item?.type === "EXCEPTION" ? "var(--color-warning)" : "var(--color-accent)"}`
                  }}
                >
                  <div
                    style={{
                      minWidth: 140,
                      color: "var(--color-text-muted)",
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-mono)"
                    }}
                  >
                    {formatTimestamp(item?.at)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <StatusBadge
                        status={item?.type === "EVENT" ? item?.eventType : item?.ruleCode}
                      />
                      {item?.type === "EVENT" ? (
                        <span style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                          {item?.referenceType && `${item.referenceType} #${item.referenceId}`}
                          {item?.warehouseId && ` | WH: ${item.warehouseId}`}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
                          {item?.contextType ?? "—"} | {item?.status ?? "—"}
                          {item?.correctedAt && ` | Corrected: ${formatTimestamp(item.correctedAt)}`}
                        </span>
                      )}
                    </div>
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", marginTop: "var(--space-1)" }}>
                      by {item?.createdBy || item?.raisedBy || "system"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {history && !history.found && (
        <Card title="Not Found" style={{ marginTop: "var(--space-4)" }}>
          <p style={{ color: "var(--color-text-muted)" }}>
            Serial number &ldquo;{serialNo}&rdquo; was not found.
          </p>
        </Card>
      )}
    </div>
  );
}
