import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import { createGrn, scanGrnSerial, completeGrn } from "../../api/modules/grn.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function GRNPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createGrn({ warehouseId: Number(warehouseId) });
      setSession(result);
    } catch (err) {
      setError(err?.message || "Failed to create GRN");
    } finally {
      setCreating(false);
    }
  }

  async function handleScan(serialNo) {
    const result = (await scanGrnSerial({ grnId: session?.grnId, serialNo })) || {};
    if (result.valid) {
      return { status: result.matchStatus || "MATCHED", message: "Serial received", state: "success" };
    }
    return {
      status: result.alert?.ruleCode || "REJECTED",
      message: result.alert?.message || "Scan rejected",
      state: result.matchStatus === "DUPLICATE_SCAN" ? "warning" : "error"
    };
  }

  async function handleComplete() {
    try {
      const result = await completeGrn({ grnId: session?.grnId });
      setSession((prev) => ({ ...(prev || {}), ...(result || {}), status: result?.status || "CLOSED" }));
    } catch (err) {
      setError(err?.message || "Failed to complete GRN");
    }
  }

  if (session) {
    return (
      <div>
        <PageHeader title="Goods Receipt Note" subtitle="Scan and verify incoming stock" />
        <Card title={`GRN #${session.grnId ?? "—"}`}>
          <ScanSession
            module="GRN"
            title={`GRN ${session.grnId ?? "—"} — ${session.status ?? "PENDING"}`}
            onScan={handleScan}
            onComplete={session.status !== "CLOSED" ? handleComplete : undefined}
            completed={session.status === "CLOSED"}
            scanCount={safeNumber(session.summary?.scannedCount)}
          />
        </Card>
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
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
            Start the session, then scan each received serial. Every serial is checked
            against IDM and the SAP dispatch records — valid serials are received, and
            anything unknown or scanned twice is logged as an exception.
          </p>
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!warehouseId || creating}>
            {creating ? "Starting..." : "Start GRN"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
