import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { useToast } from "../../components/ui/ToastProvider.jsx";
import { createGrn, scanGrnSerial, completeGrn, getGrn } from "../../api/modules/grn.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Expected items for the bound dispatch document — product details and
// quantities only, never serial numbers.
function ExpectedItems({ items }) {
  const rows = Array.isArray(items) ? items : [];

  if (rows.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", margin: 0 }}>No expected items on this dispatch document.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Batch</th>
            <th>Type</th>
            <th style={{ textAlign: "right" }}>Received / Expected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const received = safeNumber(item.receivedQty);
            const expected = safeNumber(item.expectedQty);
            const done = received >= expected && expected > 0;
            return (
              <tr key={`${item.productId}-${item.batchNo ?? ""}`}>
                <td>
                  <div style={{ fontWeight: 600 }}>{item.productName}</div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>{item.productCode}</div>
                </td>
                <td>{item.batchNo || "—"}</td>
                <td>{item.category || item.segment || "—"}</td>
                <td style={{ textAlign: "right", color: done ? "var(--color-success)" : "var(--color-text)" }}>
                  {received} / {expected}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Product-first selection. The user picks which invoice-listed product they are
// about to scan (e.g. Inverter vs Controller) before scanning its serials, so the
// backend can scope each scan to that product line.
function ProductPicker({ items, selectedProductId, onSelect }) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      {rows.map((item) => {
        const active = item.productId === selectedProductId;
        const received = safeNumber(item.receivedQty);
        const expected = safeNumber(item.expectedQty);
        return (
          <button
            key={`${item.productId}-${item.batchNo ?? ""}`}
            type="button"
            className={`button ${active ? "button--primary" : "button--secondary"}`}
            onClick={() => onSelect(item.productId)}
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.125rem" }}
          >
            <span style={{ fontWeight: 600 }}>{item.productName}</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
              {item.productCode} · {received}/{expected}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GRNPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [dispatchRef, setDispatchRef] = useState("");
  const [session, setSession] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const { showToast } = useToast();

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createGrn({ warehouseId: Number(warehouseId), dispatchRef: dispatchRef.trim() });
      setSession(result);
    } catch (err) {
      setError(err?.message || "Failed to load dispatch document");
    } finally {
      setCreating(false);
    }
  }

  // After a scan, re-pull the GRN so the per-product received counts stay live.
  async function refreshExpected() {
    if (!session?.grnId) return;
    try {
      const fresh = await getGrn({ grnId: session.grnId });
      setSession((prev) => ({ ...(prev || {}), ...(fresh || {}) }));
    } catch {
      // A failed refresh is non-fatal — the scan itself already succeeded.
    }
  }

  async function handleScan(serialNo) {
    const result = (await scanGrnSerial({ grnId: session?.grnId, serialNo, productId: selectedProductId })) || {};
    if (result.valid) {
      await refreshExpected();
      return { status: result.matchStatus || "MATCHED", message: "Serial received", state: "success" };
    }
    return {
      status: result.alert?.ruleCode || "REJECTED",
      message: result.alert?.message || "Scan rejected",
      state: result.matchStatus === "DUPLICATE_SCAN" ? "warning" : "error"
    };
  }

  function handleComplete() {
    setConfirmOpen(true);
  }

  async function doComplete() {
    setConfirmOpen(false);
    setCompleting(true);
    try {
      const result = await completeGrn({ grnId: session?.grnId });
      setSession((prev) => ({ ...(prev || {}), ...(result || {}), status: result?.status || "CLOSED" }));
      showToast({ message: "GRN session closed successfully", variant: "success" });
    } catch (err) {
      setError(err?.message || "Failed to complete GRN");
    } finally {
      setCompleting(false);
    }
  }

  if (session) {
    return (
      <div>
        <PageHeader title="Goods Receipt Note" subtitle="Scan and verify incoming stock" />

        <Card title={`Dispatch ${session.dispatchRef ?? "—"} — Expected Items`}>
          <ExpectedItems items={session.expectedProducts} />
        </Card>

        <Card title="Which product are you scanning?">
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: 0 }}>
            Select the product line before scanning its serials. Each scan is saved to the
            inventory immediately, so an interrupted session keeps everything already scanned.
          </p>
          <ProductPicker
            items={session.expectedProducts}
            selectedProductId={selectedProductId}
            onSelect={setSelectedProductId}
          />
        </Card>

        <Card title={`GRN #${session.grnId ?? "—"}`}>
          <ScanSession
            module="GRN"
            title={`GRN ${session.grnId ?? "—"} — ${session.status ?? "PENDING"}`}
            onScan={handleScan}
            onComplete={session.status !== "CLOSED" ? handleComplete : undefined}
            completed={session.status === "CLOSED"}
            scanCount={safeNumber(session.summary?.scannedCount)}
            disabled={
              session.status !== "CLOSED"
              && Array.isArray(session.expectedProducts)
              && session.expectedProducts.length > 0
              && selectedProductId == null
            }
            disabledMessage="Select a product above before scanning serials."
          />
        </Card>
        <ConfirmDialog
          open={confirmOpen}
          title="Close GRN Session"
          message="Are you sure you want to close this GRN session? No further serials can be scanned after closing."
          confirmLabel="Close Session"
          cancelLabel="Keep Open"
          variant="primary"
          onConfirm={doComplete}
          onCancel={() => setConfirmOpen(false)}
          busy={completing}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Goods Receipt Note" subtitle="Scan and verify incoming stock" />
      <Card title="Start GRN Session">
        <div className="scan-workflow-form">
          {/* Step 1 — Receiving warehouse (locked for staff, dropdown for admin) */}
          <WarehouseSelector
            label="Receiving Warehouse"
            value={warehouseId}
            onChange={setWarehouseId}
            helperText="Incoming stock is received into this warehouse."
          />
          {/* Step 2 — Scan or enter the dispatch document number */}
          <Input
            label="Dispatch Number"
            value={dispatchRef}
            onChange={setDispatchRef}
            placeholder="Scan or enter the dispatch doc number"
          />
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
            Enter the dispatch document number to load its expected items. Then scan each
            received serial — only serials whose product is listed on this dispatch document
            are accepted; anything else is logged as an exception.
          </p>
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!warehouseId || !dispatchRef.trim() || creating}>
            {creating ? "Loading..." : "Load Dispatch & Start GRN"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
