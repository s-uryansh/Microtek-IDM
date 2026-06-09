import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { LookupSelector } from "../../components/operations/LookupSelector.jsx";
import {
  createDispatch,
  fetchDispatchAvailability,
  scanDispatchSerial,
  completeDispatch
} from "../../api/modules/dispatch.js";
import { searchInvoices } from "../../api/modules/lookups.js";

export function DispatchPage() {
  const [invoiceId, setInvoiceId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [dispatchQuantity, setDispatchQuantity] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  useEffect(() => {
    if (!invoiceId || !warehouseId || session) {
      setAvailability(null);
      setAvailabilityError(null);
      return undefined;
    }

    const controller = new AbortController();
    setAvailabilityError(null);
    fetchDispatchAvailability({ invoiceId, warehouseId, signal: controller.signal })
      .then(setAvailability)
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setAvailability(null);
          setAvailabilityError(err?.message || "Failed to load warehouse stock");
        }
      });

    return () => controller.abort();
  }, [invoiceId, warehouseId, session]);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createDispatch({
        invoiceId: Number(invoiceId),
        warehouseId: Number(warehouseId),
        dispatchQuantity: Number(dispatchQuantity)
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
        <PageHeader title="Dispatch" subtitle="Scan and dispatch orders" />
        <Card title={`Dispatch #${session.dispatchId ?? "—"}`}>
          <div className="operation-panel" aria-label="Dispatch quantity summary">
            <div className="operation-panel__results">
              <div className="operation-panel__result">
                <span className="operation-panel__result-title">Session Qty {session.targetQuantity ?? "—"}</span>
                <span className="operation-panel__result-meta">
                  Current Stock: {session.currentWarehouseStockQty ?? availability?.currentWarehouseStockQty ?? "—"} ·
                  Remaining at start {session.remainingInvoiceQuantity ?? "—"}
                </span>
              </div>
            </div>
          </div>
          {selectedInvoice?.lines?.length > 0 && (
            <div className="operation-panel" aria-label="Invoice lines">
              <h3 className="operation-panel__title">Invoice Products</h3>
              <div className="operation-panel__results">
                {selectedInvoice.lines.map((line) => (
                  <div
                    key={line.invoiceLineId}
                    className="operation-panel__result"
                  >
                    <span className="operation-panel__result-title">
                      Line {line.lineNo} · {line.productCode}
                    </span>
                    <span className="operation-panel__result-meta">
                      Line ID {line.invoiceLineId} · Qty {line.quantity}
                    </span>
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
      <PageHeader title="Dispatch" subtitle="Scan and dispatch orders" />
      <Card title="Start Dispatch Session">
        <div className="scan-workflow-form">
          <LookupSelector
            title="Search Invoice"
            placeholder="Invoice reference or invoice ID"
            search={(query) => searchInvoices({ query, warehouseId })}
            onSelect={(invoice) => {
              setSelectedInvoice(invoice);
              setInvoiceId(String(invoice.invoiceId));
              setWarehouseId(String(invoice.warehouseId));
            }}
            renderItem={(invoice) => (
              <>
                <span className="operation-panel__result-title">{invoice.sapInvoiceRef}</span>
                <span className="operation-panel__result-meta">
                  Invoice #{invoice.invoiceId} · Warehouse {invoice.warehouseCode || invoice.warehouseId} · {invoice.status}
                </span>
              </>
            )}
          />
          <Input
            label="Invoice ID"
            value={invoiceId}
            onChange={setInvoiceId}
            type="number"
            inputMode="numeric"
            placeholder="Enter invoice ID"
          />
          <Input
            label="Warehouse ID"
            value={warehouseId}
            onChange={setWarehouseId}
            type="number"
            inputMode="numeric"
            placeholder="Enter warehouse ID"
          />
          <Input
            label="Dispatch Quantity"
            value={dispatchQuantity}
            onChange={setDispatchQuantity}
            type="number"
            inputMode="numeric"
            placeholder="Enter quantity for this dispatch"
          />
          {(availability || availabilityError) && (
            <div className="operation-panel" aria-label="Warehouse stock">
              <div className="operation-panel__results">
                <div className="operation-panel__result">
                  <span className="operation-panel__result-title">
                    Current Stock: {availability?.currentWarehouseStockQty ?? "—"}
                  </span>
                  <span className="operation-panel__result-meta">
                    Remaining invoice qty {availability?.remainingInvoiceQuantity ?? "—"} ·
                    Already scanned {availability?.alreadyScannedQuantity ?? "—"}
                  </span>
                  {availabilityError && (
                    <span className="operation-panel__result-meta" style={{ color: "var(--color-error)" }}>
                      {availabilityError}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!invoiceId || !warehouseId || !dispatchQuantity || creating}>
            {creating ? "Creating..." : "Start Dispatch"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
