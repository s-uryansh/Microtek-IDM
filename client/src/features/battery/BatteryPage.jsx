import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { ProductPicker } from "../../components/scan/ProductPicker.jsx";
import { commitBatterySerial, fetchBatteryCommitStatus } from "../../api/modules/battery.js";
import { searchInvoices } from "../../api/modules/lookups.js";

export function BatteryPage() {
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [committedQuantity, setCommittedQuantity] = useState(null);
  // Product-first commit (see GRN): the operator picks which battery product they
  // are about to scan before scanning its serials, so each commit is scoped to it.
  const [selectedProductId, setSelectedProductId] = useState(null);

  const batteryLines = (invoice?.lines || []).filter((line) => line.isBattery);
  const mustPickProduct = batteryLines.length > 0 && selectedProductId == null;

  async function refreshStatus(invoiceId) {
    try {
      const res = await fetchBatteryCommitStatus({ invoiceId: Number(invoiceId) });
      setCommittedQuantity(typeof res?.committedQuantity === "number" ? res.committedQuantity : null);
    } catch {
      setCommittedQuantity(null);
    }
  }

  async function handleLoad() {
    const query = invoiceQuery.trim();
    if (!query) return;
    setLoadError(null);
    setLoadingInvoice(true);
    setInvoice(null);
    setCommittedQuantity(null);
    try {
      const result = await searchInvoices({ query, batteryOnly: true });
      // Direct invoice-ID (or SAP ref) entry — load the exact match.
      const found = (result?.items || []).find(
        (item) => String(item.invoiceId) === query || item.sapInvoiceRef?.toUpperCase() === query.toUpperCase()
      );
      if (!found) {
        setLoadError("No battery invoice found for that ID/reference.");
        return;
      }
      setInvoice(found);
      refreshStatus(found.invoiceId);
    } catch (err) {
      setLoadError(err?.message || "Failed to load invoice");
    } finally {
      setLoadingInvoice(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleLoad();
  }

  async function handleScan(serialNo) {
    const res = await commitBatterySerial({
      invoiceId: Number(invoice.invoiceId),
      serialNo,
      productId: selectedProductId
    });

    if (res?.valid) {
      refreshStatus(invoice.invoiceId);
      return { status: res.status || "COMMITTED", message: "Battery serial committed", state: "success" };
    }
    return {
      status: res?.alert?.ruleCode || "REJECTED",
      message: res?.alert?.message || "Commit failed",
      state: "error"
    };
  }

  if (invoice) {
    return (
      <div>
        <PageHeader title="Battery Pre-Billing" subtitle="Commit battery serials to an invoice before billing/dispatch" />
        <Card title={`Invoice ${invoice.sapInvoiceRef} — Battery Pre-Billing`}>
          <div className="operation-panel" aria-label="Battery invoice items">
            <h3 className="operation-panel__title">
              Battery items on invoice #{invoice.invoiceId}
              {committedQuantity != null && (
                <span style={{ color: "var(--color-text-muted)", fontWeight: 400, fontSize: "0.875rem" }}>
                  {" "}· {committedQuantity} committed
                </span>
              )}
            </h3>
            <div className="operation-panel__results">
              {batteryLines.map((line) => (
                <div key={line.invoiceLineId} className="operation-panel__result">
                  <span className="operation-panel__result-title">
                    {line.productName} · {line.productCode}{" "}
                    <span className="badge">{line.category || line.segment || "—"}</span>
                  </span>
                  <span className="operation-panel__result-meta">Qty {line.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {batteryLines.length > 0 && (
            <div className="operation-panel" aria-label="Which product are you scanning?">
              <h3 className="operation-panel__title">Which product are you scanning?</h3>
              <ProductPicker
                items={batteryLines}
                selectedProductId={selectedProductId}
                onSelect={setSelectedProductId}
              />
            </div>
          )}
          <ScanSession
            module="BATTERY"
            title="Scan battery serials to commit"
            onScan={handleScan}
            placeholder="Scan battery serial number"
            disabled={mustPickProduct}
            disabledMessage="Select a battery product above before scanning serials."
          />

          <Button variant="secondary" onClick={() => { setInvoice(null); setInvoiceQuery(""); }}>
            Load a different invoice
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Battery Pre-Billing" subtitle="Commit battery serials to an invoice before billing/dispatch" />
      <Card title="Start Battery Pre-Billing">
        <div className="scan-workflow-form">
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Input
                label="Invoice ID"
                placeholder="Enter invoice number"
                value={invoiceQuery}
                onChange={(v) => setInvoiceQuery(v)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <Button onClick={handleLoad} disabled={!invoiceQuery.trim() || loadingInvoice}>
              {loadingInvoice ? "Loading..." : "Load"}
            </Button>
          </div>
          {loadError && (
            <p style={{ color: "var(--color-error)", fontSize: "0.875rem", marginTop: "var(--space-2)" }}>{loadError}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
