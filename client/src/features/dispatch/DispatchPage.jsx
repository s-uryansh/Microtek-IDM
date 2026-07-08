import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import {
  createDispatch,
  fetchDispatchAvailability,
  scanDispatchSerial,
  completeDispatch,
  createWarehouseTransfer,
  scanTransferSerial
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

function CustomerDispatchPanel({ onSessionActiveChange }) {
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [session, setSession] = useState(null);
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
      serialNo
    })) || {};
    if (result.valid) {
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
                      {line.productName} · {line.productCode}
                    </span>
                    <span className="operation-panel__result-meta">Qty {line.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ScanSession
            module="DISPATCH"
            title={`Dispatch ${session.dispatchId ?? "—"} — ${session.status ?? "PENDING"}`}
            onScan={handleScan}
            onComplete={session.status !== "DISPATCHED" ? handleComplete : undefined}
            completed={session.status === "DISPATCHED"}
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

function WarehouseTransferPanel({ onSessionActiveChange }) {
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [reference, setReference] = useState("");
  const [session, setSession] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    onSessionActiveChange?.(Boolean(session));
  }, [session, onSessionActiveChange]);

  const canStart =
    sourceWarehouseId &&
    destinationWarehouseId &&
    String(sourceWarehouseId) !== String(destinationWarehouseId);

  async function handleStart() {
    setError(null);
    setCreating(true);
    try {
      const result = await createWarehouseTransfer({
        sourceWarehouseId: Number(sourceWarehouseId),
        destinationWarehouseId: Number(destinationWarehouseId),
        reference
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
      serialNo
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
    setScanCount(0);
  }

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
          <ScanSession
            module="DISPATCH"
            title={`Transfer ${session.externalRef}`}
            scanCount={scanCount}
            onScan={handleScan}
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
          />
          <Input
            label="Reference (optional)"
            value={reference}
            onChange={setReference}
            placeholder="e.g. internal transfer note number"
          />
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleStart} disabled={!canStart || creating}>
            {creating ? "Starting..." : "Start Transfer"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

const DISPATCH_MODES = [
  { key: "customer", label: "Customer Dispatch" },
  { key: "transfer", label: "Warehouse Transfer" }
];

export function DispatchPage() {
  const [mode, setMode] = useState("customer");
  const [sessionActive, setSessionActive] = useState(false);

  return (
    <div>
      <PageHeader title="Dispatch" subtitle="Scan and dispatch orders" />

      {/* Once a session is underway, the other mode is hidden — switching mid-session
          would be confusing for the worker and doesn't correspond to anything useful. */}
      {!sessionActive && (
        <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
          {DISPATCH_MODES.map((item) => (
            <button
              key={item.key}
              onClick={() => setMode(item.key)}
              style={{
                padding: "var(--space-2) var(--space-4)",
                border: "none",
                borderBottom: mode === item.key ? "2px solid var(--color-primary)" : "2px solid transparent",
                backgroundColor: "transparent",
                cursor: "pointer",
                fontWeight: mode === item.key ? 600 : 400,
                color: mode === item.key ? "var(--color-primary)" : "var(--color-text-muted)",
                fontSize: "0.875rem"
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {mode === "customer" ? (
        <CustomerDispatchPanel onSessionActiveChange={setSessionActive} />
      ) : (
        <WarehouseTransferPanel onSessionActiveChange={setSessionActive} />
      )}
    </div>
  );
}
