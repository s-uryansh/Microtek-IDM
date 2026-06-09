import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import {
  scanSapReceipt,
  fetchAgeingSummary
} from "../../api/modules/importMonitor.js";

const TABS = [
  { key: "receipt", label: "Receipt Scan" },
  { key: "ageing", label: "Ageing Summary" }
];

function formatTimestamp(iso) {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ReceiptScanTab() {
  const [receivingWarehouseId, setReceivingWarehouseId] = useState("");

  async function handleScan(serialNo) {
    if (!receivingWarehouseId) {
      return { status: "ERROR", message: "Receiving warehouse ID is required", state: "error" };
    }

    const result = (await scanSapReceipt({
      serialNo,
      receivingWarehouseId: Number(receivingWarehouseId)
    })) || {};

    if (result.valid) {
      return {
        status: result.matchStatus || "MATCHED",
        message: `Received from warehouse ${result.sourceWarehouseId ?? "-"} into ${result.receivedWarehouseId ?? receivingWarehouseId}`,
        state: "success"
      };
    }

    return {
      status: result.alert?.ruleCode || result.matchStatus || "REJECTED",
      message: result.alert?.message || "Scan rejected",
      state: "error"
    };
  }

  return (
    <div>
      <Card title="SAP Receipt Scan">
        <div className="scan-workflow-form">
          <Input
            label="Receiving Warehouse ID"
            value={receivingWarehouseId}
            onChange={setReceivingWarehouseId}
            type="number"
            inputMode="numeric"
            placeholder="Enter receiving warehouse ID"
          />
        </div>
        <ScanSession
          module="SAP_RECEIPT"
          title="SAP Receipt Validation"
          scannerLabel="Scan QR Serial"
          placeholder="Scan product QR or enter serial number"
          onScan={handleScan}
          disabled={!receivingWarehouseId}
          disabledMessage="Enter the receiving warehouse ID before scanning incoming stock."
        />
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
  const [activeTab, setActiveTab] = useState("receipt");

  return (
    <div>
      <PageHeader title="SAP Import Monitor" subtitle="Validate factory dispatch receipts" />

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

      {activeTab === "receipt" && <ReceiptScanTab />}
      {activeTab === "ageing" && <AgeingSummaryTab />}
    </div>
  );
}
