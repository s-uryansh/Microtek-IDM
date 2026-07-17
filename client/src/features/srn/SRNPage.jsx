import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { ProductPicker } from "../../components/scan/ProductPicker.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import { createSrn, scanSrnSerial } from "../../api/modules/srn.js";
import { searchInvoices } from "../../api/modules/lookups.js";

const CONDITION_TAGS = ["SALEABLE", "DEFECTIVE", "REPAIR"];

export function SRNPage() {
  const [invoiceInput, setInvoiceInput] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [expectedQuantity, setExpectedQuantity] = useState("");
  const [conditionTag, setConditionTag] = useState("SALEABLE");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [returnedCount, setReturnedCount] = useState(0);
  // Product-first return scan (see GRN): during scanning the operator picks which
  // of the return-selected products they are about to scan, scoping each scan to it.
  const [scanProductId, setScanProductId] = useState(null);

  function handleToggleProduct(productId) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  async function handleLoadInvoice() {
    setLoadError(null);
    setLoadingInvoice(true);
    setSelectedProductIds(new Set());
    try {
      // Operator enters a specific invoice ID (or full SAP ref) — load the exact
      // match, not a fuzzy ILIKE hit on another ref with the same digits.
      const query = invoiceInput.trim();
      const result = await searchInvoices({ query });
      const found = (result?.items || []).find(
        (item) => String(item.invoiceId) === query || item.sapInvoiceRef?.toUpperCase() === query.toUpperCase()
      );
      if (!found) {
        setLoadError("Invoice not found");
        return;
      }
      // A return is only valid for an invoice that was dispatched. A PENDING
      // invoice was never dispatched, so there is nothing legitimate to return.
      // (Partial dispatches show IN_PROGRESS and are allowed; the server makes
      // the final check that dispatched serials exist.)
      if (found.status === "PENDING") {
        setLoadError("This invoice has not been dispatched; there is nothing to return.");
        return;
      }
      setInvoice(found);
    } catch (err) {
      setLoadError(err?.message || "Failed to load invoice");
    } finally {
      setLoadingInvoice(false);
    }
  }

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createSrn({
        warehouseId: Number(warehouseId),
        invoiceId: Number(invoice.invoiceId),
        returnProductIds: Array.from(selectedProductIds),
        expectedQuantity: expectedQuantity ? Number(expectedQuantity) : null
      });
      setSession({ ...result, invoiceRef: invoice.sapInvoiceRef });
    } catch (err) {
      setError(err?.message || "Failed to create SRN");
    } finally {
      setCreating(false);
    }
  }

  async function handleScan(serialNo, rowConditionTag = conditionTag) {
    const result = (await scanSrnSerial({
      srnId: session?.srnId,
      serialNo,
      conditionTag: rowConditionTag,
      productId: scanProductId
    })) || {};
    if (result.valid) {
      setReturnedCount((count) => count + 1);
      return {
        status: "ACCEPTED",
        message: `Return accepted (${result.conditionTag || rowConditionTag})`,
        state: "success"
      };
    }
    return {
      status: result.alert?.ruleCode || "REJECTED",
      message: result.alert?.message || "Return rejected",
      state: "error"
    };
  }

  const declaredQuantity = expectedQuantity ? Number(expectedQuantity) : null;
  const limitReached = declaredQuantity !== null && returnedCount >= declaredQuantity;
  // The operator can only scan against products they flagged for return.
  const scanProducts = (invoice?.lines ?? []).filter((line) => selectedProductIds.has(line.productId));
  const mustPickProduct = scanProducts.length > 0 && scanProductId == null;

  if (session) {
    return (
      <div>
        <PageHeader title="Customer Returns" subtitle="Scan and process returned serials" />
        <Card title={`SRN #${session.srnId ?? "—"}`}>
          <div className="scan-workflow-form scan-workflow-form--compact">
            <div className="input-group">
              <label className="input-group__label">Invoice</label>
              <div className="input" aria-readonly="true"
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-surface-subtle)"
                }}
              >
                {session.invoiceRef || `Invoice #${session.invoiceId}`}
              </div>
            </div>
            <ConditionTagSelect value={conditionTag} onChange={setConditionTag} />
          </div>
          {scanProducts.length > 0 && (
            <div className="input-group">
              <label className="input-group__label">Which product are you scanning?</label>
              <ProductPicker
                items={scanProducts}
                selectedProductId={scanProductId}
                onSelect={setScanProductId}
              />
            </div>
          )}
          <ScanSession
            module="SRN"
            title={
              declaredQuantity !== null
                ? `SRN ${session.srnId ?? "—"} — ${returnedCount} of ${declaredQuantity} returned`
                : `SRN ${session.srnId ?? "—"} — ${session.status ?? "PENDING"}`
            }
            onScan={handleScan}
            scanCount={returnedCount}
            disabled={limitReached || mustPickProduct}
            disabledMessage={
              limitReached
                ? `All ${declaredQuantity} declared return units have been scanned.`
                : mustPickProduct
                  ? "Select a product above before scanning serials."
                  : ""
            }
            placeholder="Scan return serial number"
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Customer Returns" subtitle="Scan and process returned serials" />
      <Card title="Start Return Session">
        <div className="scan-workflow-form">
          {/* Returns are received INTO the operator's assigned warehouse. The
              invoice itself carries no warehouse. */}
          <WarehouseSelector
            label="Receiving warehouse"
            value={warehouseId}
            onChange={setWarehouseId}
            helperText="Returned stock is received into this warehouse."
          />
          <div className="input-group">
            <label className="input-group__label" htmlFor="srn-invoice-input">Invoice ID</label>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <input
                id="srn-invoice-input"
                className="input"
                type="text"
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                placeholder="Enter invoice ID"
                style={{ flex: 1 }}
              />
              <Button onClick={handleLoadInvoice} disabled={!invoiceInput || loadingInvoice}>
                {loadingInvoice ? "Loading..." : "Load"}
              </Button>
            </div>
          </div>

          {loadError && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{loadError}</p>}

          {invoice && (
            <>
              <div className="input-group">
                <label className="input-group__label">Invoice</label>
                <div className="input" aria-readonly="true"
                  style={{
                    color: "var(--color-text-secondary)",
                    backgroundColor: "var(--color-surface-subtle)"
                  }}
                >
                  {invoice.sapInvoiceRef} · Invoice #{invoice.invoiceId}
                </div>
              </div>

              {invoice.lines?.length > 0 && (
                <div className="input-group">
                  <label className="input-group__label">Items on Invoice</label>
                  <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                      <thead>
                        <tr style={{ backgroundColor: "var(--color-surface-subtle)", textAlign: "left" }}>
                          <th style={{ padding: "var(--space-2) var(--space-3)", width: "40px" }}></th>
                          <th style={{ padding: "var(--space-2) var(--space-3)" }}>#</th>
                          <th style={{ padding: "var(--space-2) var(--space-3)" }}>Product</th>
                          <th style={{ padding: "var(--space-2) var(--space-3)" }}>Code</th>
                          <th style={{ padding: "var(--space-2) var(--space-3)" }}>Category</th>
                          <th style={{ padding: "var(--space-2) var(--space-3)" }}>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.lines.map((line) => (
                          <tr key={line.invoiceLineId} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                              <input
                                type="checkbox"
                                checked={selectedProductIds.has(line.productId)}
                                onChange={() => handleToggleProduct(line.productId)}
                              />
                            </td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>{line.lineNo}</td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>{line.productName}</td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>{line.productCode}</td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                              <span className="badge">{line.category || line.segment || "—"}</span>
                            </td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>{line.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="input-group">
                <label className="input-group__label" htmlFor="srn-expected-qty">Quantity being returned</label>
                <input
                  id="srn-expected-qty"
                  className="input"
                  type="number"
                  min="1"
                  value={expectedQuantity}
                  onChange={(e) => setExpectedQuantity(e.target.value)}
                  placeholder="How many units are being returned?"
                />
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                  You still scan each returned serial — this is the expected count for this return.
                </p>
              </div>

              <ConditionTagSelect value={conditionTag} onChange={setConditionTag} />
              {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
              <Button onClick={handleCreate} disabled={creating || !warehouseId || selectedProductIds.size === 0}>
                {creating ? "Creating..." : "Start SRN"}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function ConditionTagSelect({ value, onChange }) {
  return (
    <div>
      <label
        htmlFor="srn-condition-tag"
        className="input-group__label"
        style={{ display: "block", marginBottom: "var(--space-2)" }}
      >
        Condition Tag
      </label>
      <select
        id="srn-condition-tag"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        style={{ width: "100%" }}
      >
        {CONDITION_TAGS.map((tag) => (
          <option key={tag} value={tag}>{tag}</option>
        ))}
      </select>
    </div>
  );
}
