import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import { createWarehouseTransfer, scanTransferSerial } from "../../api/modules/dispatch.js";

export function WarehouseTransferPanel({ onSessionActiveChange }) {
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
            allowStaffSelect
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
