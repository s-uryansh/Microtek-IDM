import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { ProductPicker } from "../../components/scan/ProductPicker.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import {
  createDispatch,
  fetchDispatchAvailability,
  scanDispatchSerial,
  completeDispatch
} from "../../api/modules/dispatch.js";
import { searchInvoices } from "../../api/modules/lookups.js";

function PartialBanner({ stock, required }) {
  return (
    <div
      style={{
        padding: "var(--space-3)",
        marginBottom: "var(--space-3)",
        backgroundColor: "var(--color-warning-subtle, #2d2008)",
        borderRadius: "var(--radius-md)",
        color: "var(--color-warning)",
        fontSize: "0.875rem"
      }}
    >
      Partial dispatch: only <strong>{stock}</strong> of <strong>{required}</strong> units are in stock.
      A shortage exception has been raised — dispatch the rest once stock arrives.
    </div>
  );
}

export function CustomerDispatchPanel({ onSessionActiveChange }) {
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  // Product-first scan (see GRN): the operator picks which invoice line they are
  // about to scan before scanning its serials, so each scan is scoped to that row.
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [session, setSession] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availabilityError, setAvailabilityError] = useState(null);

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
      // The operator enters a specific invoice ID (or full SAP ref), so load the
      // exact match — never a fuzzy ILIKE hit like a different ref containing the
      // same digits. Invoices carry no warehouse; the dispatch warehouse is the
      // operator's own assigned warehouse (see WarehouseSelector below).
      const invoice = items.find(
        (item) => String(item.invoiceId) === query || item.sapInvoiceRef?.toUpperCase() === query.toUpperCase()
      );
      if (!invoice) {
        setLoadError("Invoice not found");
        return;
      }
      // An already fully-dispatched invoice cannot be dispatched again.
      if (invoice.status === "DISPATCHED") {
        setLoadError("This invoice has already been fully dispatched.");
        return;
      }
      // TRANSFER invoices (V030) gate warehouse-to-warehouse transfers, not
      // customer sales — the server rejects them too (INVOICE_TYPE_MISMATCH).
      if (invoice.invoiceType === "TRANSFER") {
        setLoadError("This is a warehouse-transfer invoice — use the Warehouse Transfer tab instead.");
        return;
      }
      setSelectedInvoice(invoice);
      setInvoiceId(String(invoice.invoiceId));
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

  useEffect(() => {
    if (!invoiceId || !warehouseId || session) {
      setAvailability(null);
      setAvailabilityError(null);
      return undefined;
    }

    const controller = new AbortController();
    setAvailabilityError(null);
    fetchDispatchAvailability({ invoiceId: Number(invoiceId), warehouseId: Number(warehouseId), signal: controller.signal })
      .then(setAvailability)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setAvailability(null);
          setAvailabilityError(err?.message || "Failed to load warehouse stock");
        }
      });

    return () => controller.abort();
  }, [invoiceId, warehouseId, session]);

  const remainingQty = availability?.remainingInvoiceQuantity;
  const stockQty = availability?.currentWarehouseStockQty;
  const willBePartial =
    typeof stockQty === "number" && typeof remainingQty === "number" && stockQty < remainingQty;
  const canStart = Boolean(invoiceId && warehouseId && availability && stockQty > 0);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createDispatch({
        invoiceId: Number(invoiceId),
        warehouseId: Number(warehouseId)
      });
      // Resume: seed the visible count from serials already dispatched in a prior
      // (interrupted) session so the operator sees where they left off and does not
      // rescan them. New scans increment from this base.
      setScanCount(result?.alreadyScannedQuantity ?? 0);
      setSession(result);
    } catch (err) {
      setError(err?.message || "Failed to create dispatch");
    } finally {
      setCreating(false);
    }
  }

  async function handleScan(serialNo) {
    const result = (await scanDispatchSerial({
      dispatchId: session?.dispatchId,
      serialNo,
      productId: selectedProductId
    })) || {};
    if (result.valid) {
      setScanCount((count) => count + 1);
      return { status: result.status || "ACCEPTED", message: "Serial dispatched", state: "success" };
    }
    return {
      status: result.alert?.ruleCode || "REJECTED",
      message: result.alert?.message || "Scan rejected",
      state: "error"
    };
  }

  async function handleComplete() {
    try {
      const result = await completeDispatch({ dispatchId: session?.dispatchId });
      setSession((prev) => ({ ...(prev || {}), ...(result || {}), status: result?.status || "DISPATCHED" }));
    } catch (err) {
      setError(err?.message || "Failed to complete dispatch");
    }
  }

  // Products the operator can scan against — the loaded invoice's lines.
  const scanProducts = selectedInvoice?.lines ?? [];
  const mustPickProduct = scanProducts.length > 0 && selectedProductId == null;

  if (session) {
    return (
      <div>
        <Card title={`Dispatch #${session.dispatchId ?? "—"}`}>
          {session.partial && (
            <PartialBanner stock={session.dispatchQuantity} required={session.remainingInvoiceQuantity} />
          )}
          <div className="operation-panel" aria-label="Dispatch summary">
            <div className="operation-panel__results">
              <div className="operation-panel__result">
                <span className="operation-panel__result-title">
                  Dispatching {session.dispatchQuantity ?? session.targetQuantity ?? "—"} unit(s)
                </span>
                <span className="operation-panel__result-meta">
                  Invoice required {session.remainingInvoiceQuantity ?? "—"} · In stock{" "}
                  {session.currentWarehouseStockQty ?? "—"}
                </span>
              </div>
            </div>
          </div>
          {selectedInvoice?.lines?.length > 0 && (
            <div className="operation-panel" aria-label="Invoice lines">
              <h3 className="operation-panel__title">Invoice Products</h3>
              <div className="operation-panel__results">
                {selectedInvoice.lines.map((line) => (
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
          )}
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
            title={`Dispatch ${session.dispatchId ?? "—"} — ${session.status ?? "PENDING"}`}
            scanCount={scanCount}
            onScan={handleScan}
            onComplete={session.status !== "DISPATCHED" ? handleComplete : undefined}
            completed={session.status === "DISPATCHED"}
            disabled={mustPickProduct}
            disabledMessage="Select a product above before scanning serials."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card title="Start Dispatch Session">
        <div className="scan-workflow-form">
          {/* Warehouse the operator dispatches from — locked to their assigned
              warehouse (staff) or selectable (admin). Invoices are not tied to it. */}
          <WarehouseSelector
            label="Dispatch from warehouse"
            value={warehouseId}
            onChange={setWarehouseId}
            helperText="Stock is dispatched out of this warehouse. Each scanned serial must physically be here."
          />

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
            <>
              <div className="operation-panel" aria-label="Invoice info" style={{ marginTop: "var(--space-3)" }}>
                <div className="operation-panel__results">
                  <div className="operation-panel__result">
                    <span className="operation-panel__result-title">
                      {selectedInvoice.sapInvoiceRef}
                    </span>
                    <span className="operation-panel__result-meta">
                      Invoice #{selectedInvoice.invoiceId} · {selectedInvoice.status}
                    </span>
                  </div>
                </div>
              </div>

              {selectedInvoice.lines?.length > 0 && (
                <div className="operation-panel" aria-label="Invoice review">
                  <h3 className="operation-panel__title">Invoice #{selectedInvoice.invoiceId} — items to dispatch</h3>
                  <table className="data-table__table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Item</th>
                        <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Category</th>
                        <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.lines.map((line) => (
                        <tr key={line.invoiceLineId} className="data-table__row">
                          <td style={{ padding: "var(--space-2)" }}>
                            <span style={{ fontWeight: 600 }}>{line.productName}</span>
                            <span
                              style={{
                                color: "var(--color-text-muted)",
                                fontSize: "0.8125rem",
                                display: "block",
                                fontFamily: "var(--font-mono)"
                              }}
                            >
                              {line.productCode}
                            </span>
                          </td>
                          <td style={{ padding: "var(--space-2)" }}>
                            <span className="badge">{line.category || line.segment || "—"}</span>
                          </td>
                          <td style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {line.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(availability || availabilityError) && (
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
                            ? "No stock available — cannot dispatch."
                            : willBePartial
                              ? `Not enough stock — starting will dispatch ${stockQty} unit(s) as a PARTIAL dispatch and raise a shortage exception.`
                              : `Enough stock — the full invoice quantity (${remainingQty}) will be dispatched.`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {availability?.productAvailability?.length > 0 && (
                <div className="operation-panel" aria-label="Stock by product">
                  <h3 className="operation-panel__title">Stock in this warehouse — per item</h3>
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
              <Button onClick={handleCreate} disabled={!canStart || creating}>
                {creating ? "Creating..." : willBePartial ? "Start Partial Dispatch" : "Start Dispatch"}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
