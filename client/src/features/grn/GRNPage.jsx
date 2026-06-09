import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { LookupSelector } from "../../components/operations/LookupSelector.jsx";
import { createGrn, scanGrnSerial, completeGrn } from "../../api/modules/grn.js";
import { searchDispatchDocs } from "../../api/modules/lookups.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function GRNPage() {
  const [sapDispatchDocId, setSapDispatchDocId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createGrn({
        sapDispatchDocId: Number(sapDispatchDocId),
        warehouseId: Number(warehouseId)
      });
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
      return { status: result.matchStatus || "MATCHED", message: "Serial matched", state: "success" };
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
          <LookupSelector
            title="Search Dispatch Document"
            placeholder="SAP dispatch reference or document ID"
            search={(query) => searchDispatchDocs({ query, warehouseId })}
            onSelect={(doc) => {
              setSapDispatchDocId(String(doc.sapDispatchDocId));
              setWarehouseId(String(doc.destinationWarehouseId));
            }}
            renderItem={(doc) => (
              <>
                <span className="operation-panel__result-title">{doc.externalRef}</span>
                <span className="operation-panel__result-meta">
                  Doc #{doc.sapDispatchDocId} · Destination {doc.destinationWarehouseCode || doc.destinationWarehouseId}
                </span>
              </>
            )}
          />
          <Input
            label="SAP Dispatch Document ID"
            value={sapDispatchDocId}
            onChange={setSapDispatchDocId}
            type="number"
            inputMode="numeric"
            placeholder="Enter dispatch document ID"
          />
          <Input
            label="Receiving Warehouse ID"
            value={warehouseId}
            onChange={setWarehouseId}
            type="number"
            inputMode="numeric"
            placeholder="Enter warehouse ID"
          />
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!sapDispatchDocId || !warehouseId || creating}>
            {creating ? "Creating..." : "Start GRN"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
