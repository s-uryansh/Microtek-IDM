import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { createDispatch, scanDispatchSerial, completeDispatch } from "../../api/modules/dispatch.js";

export function DispatchPage() {
  const [invoiceId, setInvoiceId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceLineId, setInvoiceLineId] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

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
    if (!invoiceLineId) {
      return { status: "ERROR", message: "Invoice line ID is required", state: "error" };
    }
    const result = (await scanDispatchSerial({
      dispatchId: session?.dispatchId,
      invoiceLineId: Number(invoiceLineId),
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
          <div className="scan-workflow-form scan-workflow-form--compact">
            <Input
              label="Invoice Line ID"
              value={invoiceLineId}
              onChange={setInvoiceLineId}
              type="number"
              inputMode="numeric"
              placeholder="Enter invoice line ID for each scan"
            />
          </div>
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
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!invoiceId || !warehouseId || creating}>
            {creating ? "Creating..." : "Start Dispatch"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
