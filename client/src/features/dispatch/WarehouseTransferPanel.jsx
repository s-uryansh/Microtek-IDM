import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { ProductPicker } from "../../components/scan/ProductPicker.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import {
  createWarehouseTransfer,
  scanTransferSerial,
  fetchDispatchAvailability
} from "../../api/modules/dispatch.js";
import { searchInvoices } from "../../api/modules/lookups.js";

export function WarehouseTransferPanel({ onSessionActiveChange }) {
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [reference, setReference] = useState("");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  // Product-first scan (see GRN/customer dispatch): the operator picks which
  // invoice line they are about to scan before scanning its serials, so each
  // scan is scoped to that row via `expectedProductId` on the backend.
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [session, setSession] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    onSessionActiveChange?.(Boolean(session));
  }, [session, onSessionActiveChange]);

  async function handleLoad() {
    const query = invoiceQuery.trim();
    if (!query) return;
    setLoadError(null);
    setLoadingInvoice(true);
    setSelectedInvoice(null);
    setInvoiceId("");
    setAvailability(null);
    setAvailabilityError(null);
    try {
      const result = await searchInvoices({ query });
      const items = result?.items || [];
      // Exact match only — the operator types a specific invoice ID or full SAP
      // ref, never a fuzzy ILIKE hit. Same rule as the customer dispatch panel.
      const invoice = items.find(
        (item) => String(item.invoiceId) === query || item.sapInvoiceRef?.toUpperCase() === query.toUpperCase()
      );
      if (!invoice) {
        setLoadError("Invoice not found");
        return;
      }
      if (invoice.status === "DISPATCHED") {
        setLoadError("This invoice has already been fully dispatched.");
        return;
      }
      // Only TRANSFER invoices (V030) can gate a warehouse transfer — they carry
      // the source → destination route themselves. Customer invoices belong in
      // the Customer Dispatch tab.
      if (invoice.invoiceType !== "TRANSFER") {
        setLoadError(
          "This is a customer invoice a warehouse transfer needs a TRANSFER invoice with a source and destination warehouse."
        );
        return;
      }
      setSelectedInvoice(invoice);
      setInvoiceId(String(invoice.invoiceId));
      // Auto-fill the route from the invoice: the transfer must match it anyway
      // (the server rejects a mismatched route with TRANSFER_ROUTE_MISMATCH).
      if (invoice.sourceWarehouseId != null) {
        setSourceWarehouseId(String(invoice.sourceWarehouseId));
      }
      if (invoice.destinationWarehouseId != null) {
        setDestinationWarehouseId(String(invoice.destinationWarehouseId));
      }
    } catch (err) {
      setLoadError(err?.message || "Failed to load invoice");
    } finally {
      setLoadingInvoice(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      handleLoad();
    }
  }

  // Same stock check as customer dispatch, but against the SOURCE warehouse the
  // stock is leaving from.
  useEffect(() => {
    if (!invoiceId || !sourceWarehouseId || session) {
      setAvailability(null);
      setAvailabilityError(null);
      return undefined;
    }

    const controller = new AbortController();
    setAvailabilityError(null);
    fetchDispatchAvailability({
      invoiceId: Number(invoiceId),
      warehouseId: Number(sourceWarehouseId),
      signal: controller.signal
    })
      .then(setAvailability)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setAvailability(null);
          setAvailabilityError(err?.message || "Failed to load warehouse stock");
        }
      });

    return () => controller.abort();
  }, [invoiceId, sourceWarehouseId, session]);

  const remainingQty = availability?.remainingInvoiceQuantity;
  const stockQty = availability?.currentWarehouseStockQty;

  const canStart =
    sourceWarehouseId &&
    destinationWarehouseId &&
    String(sourceWarehouseId) !== String(destinationWarehouseId) &&
    invoiceId &&
    availability &&
    stockQty > 0;

  async function handleStart() {
    setError(null);
    setCreating(true);
    try {
      const result = await createWarehouseTransfer({
        sourceWarehouseId: Number(sourceWarehouseId),
        destinationWarehouseId: Number(destinationWarehouseId),
        reference,
        invoiceId: Number(invoiceId)
      });
      setSession(result);
      setScanCount(0);
    } catch (err) {
      setError(err?.message || "Failed to start transfer");
    } finally {
      setCreating(false);
    }
  }

  async function handleScan(serialNo) {
    const result = (await scanTransferSerial({
      transferId: session?.sapDispatchDocId,
      serialNo,
      productId: selectedProductId
    })) || {};
    if (result.valid) {
      setScanCount((count) => count + 1);
      return { status: "SCANNED", message: "Serial moved out — awaiting receipt at destination", state: "success" };
    }
    return {
      status: result.alert?.ruleCode || "REJECTED",
      message: result.alert?.message || "Scan rejected",
      state: "error"
    };
  }

  function handleDone() {
    setSession(null);
    setSourceWarehouseId("");
    setDestinationWarehouseId("");
    setReference("");
    setInvoiceQuery("");
    setInvoiceId("");
    setSelectedInvoice(null);
    setSelectedProductId(null);
    setLoadError(null);
    setAvailability(null);
    setAvailabilityError(null);
    setScanCount(0);
  }

  // Products the operator can scan against — the gating TRANSFER invoice's lines.
  const scanProducts = selectedInvoice?.lines ?? [];
  const mustPickProduct = scanProducts.length > 0 && selectedProductId == null;

  if (session) {
    return (
      <div>
        <Card title={`Transfer ${session.externalRef}`}>
          <div className="operation-panel" aria-label="Transfer summary">
            <div className="operation-panel__results">
              <div className="operation-panel__result">
                <span className="operation-panel__result-title">
                  Warehouse {session.sourceWarehouseId} → Warehouse {session.destinationWarehouseId}
                </span>
                <span className="operation-panel__result-meta">
                  Reference {session.externalRef} · destination receives this stock via a normal GRN
                </span>
              </div>
            </div>
          </div>
          {scanProducts.length > 0 && (
            <div className="operation-panel" aria-label="Which product are you scanning?">
              <h3 className="operation-panel__title">Which product are you scanning?</h3>
              <ProductPicker
                items={scanProducts}
                selectedProductId={selectedProductId}
                onSelect={setSelectedProductId}
              />
            </div>
          )}
          <ScanSession
            module="DISPATCH"
            title={`Transfer ${session.externalRef}`}
            scanCount={scanCount}
            onScan={handleScan}
            disabled={mustPickProduct}
            disabledMessage="Select a product above before scanning serials."
          />
          <div style={{ marginTop: "var(--space-3)" }}>
            <Button variant="secondary" onClick={handleDone}>
              Done
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card title="Start Warehouse Transfer">
        <div className="scan-workflow-form" style={{ maxWidth: 400 }}>
          <WarehouseSelector
            label="From warehouse"
            value={sourceWarehouseId}
            onChange={setSourceWarehouseId}
            helperText="Stock is scanned out of this warehouse."
          />
          <WarehouseSelector
            label="To warehouse"
            value={destinationWarehouseId}
            onChange={setDestinationWarehouseId}
            helperText="Receives the stock via a normal GRN once scanning is done."
            allowStaffSelect
          />
          <Input
            label="Reference (optional)"
            value={reference}
            onChange={setReference}
            placeholder="e.g. internal transfer note number"
          />

          {/* Invoice gate — same check as the customer dispatch flow. The transfer
              is validated against this invoice; stock is checked against the source
              warehouse the units are leaving. */}
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
            <p style={{ color: "var(--color-error)", fontSize: "0.875rem", marginTop: "var(--space-2)" }}>
              {loadError}
            </p>
          )}

          {selectedInvoice && (
            <div className="operation-panel" aria-label="Invoice info" style={{ marginTop: "var(--space-3)" }}>
              <div className="operation-panel__results">
                <div className="operation-panel__result">
                  <span className="operation-panel__result-title">{selectedInvoice.sapInvoiceRef}</span>
                  <span className="operation-panel__result-meta">
                    Invoice #{selectedInvoice.invoiceId} · {selectedInvoice.status} · TRANSFER{" "}
                    {selectedInvoice.sourceWarehouseCode ?? selectedInvoice.sourceWarehouseId} →{" "}
                    {selectedInvoice.destinationWarehouseCode ?? selectedInvoice.destinationWarehouseId}
                  </span>
                </div>
              </div>
            </div>
          )}

          {selectedInvoice && (availability || availabilityError) && (
            <div className="operation-panel" aria-label="Warehouse stock">
              <div className="operation-panel__results">
                <div className="operation-panel__result">
                  <span className="operation-panel__result-title">
                    In stock: {stockQty ?? "—"} · Invoice needs: {remainingQty ?? "—"}
                  </span>
                  <span className="operation-panel__result-meta">
                    {availabilityError
                      ? availabilityError
                      : stockQty === 0
                        ? "No stock available in the source warehouse — cannot transfer."
                        : "Source warehouse stock confirmed against the invoice."}
                  </span>
                </div>
              </div>
            </div>
          )}

          {selectedInvoice && availability?.productAvailability?.length > 0 && (
            <div className="operation-panel" aria-label="Stock by product">
              <h3 className="operation-panel__title">Stock in source warehouse — per item</h3>
              <div className="operation-panel__results">
                {availability.productAvailability.map((item) => {
                  const line = selectedInvoice.lines?.find(
                    (l) => Number(l.productId) === Number(item.productId)
                  );
                  const short = item.inStockQty < item.requiredQuantity;
                  return (
                    <div key={item.productId} className="operation-panel__result">
                      <span className="operation-panel__result-title">
                        {line?.productName ?? `Product #${item.productId}`}
                        {line?.productCode && (
                          <span
                            style={{
                              color: "var(--color-text-muted)",
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.8125rem",
                              marginLeft: "var(--space-2)"
                            }}
                          >
                            {line.productCode}
                          </span>
                        )}
                      </span>
                      <span
                        className="operation-panel__result-meta"
                        style={short ? { color: "var(--color-warning)" } : undefined}
                      >
                        In stock {item.inStockQty} · Needed {item.requiredQuantity}
                        {short ? " — short" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleStart} disabled={!canStart || creating}>
            {creating ? "Starting..." : "Start Transfer"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
