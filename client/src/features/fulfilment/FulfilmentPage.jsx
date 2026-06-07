import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { fetchFulfilmentStatus } from "../../api/modules/fulfilment.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function FulfilmentPage() {
  const [invoiceId, setInvoiceId] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch() {
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      const result = await fetchFulfilmentStatus({ invoiceId: Number(invoiceId) });
      if (!result) {
        setError("No fulfilment data found for this invoice.");
      } else {
        setStatus(result);
      }
    } catch (err) {
      setError(err?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Fulfilment Status" subtitle="Track order fulfilment progress" />
      <Card title="Order Lookup">
        <div className="scan-workflow-form lookup-form">
          <Input
            label="Invoice ID"
            value={invoiceId}
            onChange={setInvoiceId}
            type="number"
            inputMode="numeric"
            placeholder="Enter invoice ID"
          />
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleSearch} disabled={!invoiceId || loading}>
            {loading ? "Searching..." : "Search"}
          </Button>

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
