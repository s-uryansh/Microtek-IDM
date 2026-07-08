import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { fetchFulfilmentStatus } from "../../api/modules/fulfilment.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function FulfilmentPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();

  async function loadStatus(id) {
    const result = await fetchFulfilmentStatus({ invoiceId: Number(id) });
    return result;
  }

  useEffect(() => {
    const q = searchParams.get("q");
    if (!q) return;
    const digits = q.replace(/[^\d]/g, "");
    if (!digits) return;
    setError(null);
    setStatus(null);
    loadStatus(digits)
      .then((result) => {
        if (!result) {
          setError("No fulfilment data found for this invoice.");
        } else {
          setStatus(result);
        }
      })
      .catch((err) => setError(err?.message || "Search failed"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleScanInvoice(value) {
    const result = await loadStatus(value);
    if (!result) {
      return { status: "NOT_FOUND", message: "No fulfilment data found", state: "error" };
    }
    setStatus(result);
    return { status: result.status || "FOUND", message: "Fulfilment status loaded", state: "success" };
  }

  return (
    <div>
      <PageHeader title="Fulfilment Status" subtitle="Track order fulfilment progress" />
      <Card title="Order Lookup">
        <div className="scan-workflow-form lookup-form">
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <ScanSession
            module="FULFILMENT"
            title="Invoice scanner"
            scannerLabel="Scan Invoice"
            placeholder="Scan or enter invoice ID"
            onScan={handleScanInvoice}
          />

          {status && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-4)",
                padding: "var(--space-4)",
                backgroundColor: "var(--color-bg-surface)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>Invoice #{status.invoiceId ?? "—"}</span>
                <StatusBadge status={status.status ?? "PENDING"} />
              </div>
              <div className="metric-strip">
                <div>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Required</p>
                  <p style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                    {safeNumber(status.requiredQuantity)}
                  </p>
                </div>
                <div>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Scanned</p>
                  <p style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                    {safeNumber(status.scannedQuantity)}
                  </p>
                </div>
                <div>
                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>Committed</p>
                  <p style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                    {safeNumber(status.committedQuantity)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
