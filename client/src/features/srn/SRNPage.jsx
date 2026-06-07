import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { createSrn, scanSrnSerial } from "../../api/modules/srn.js";

const CONDITION_TAGS = ["SALEABLE", "DEFECTIVE", "REPAIR"];

export function SRNPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [conditionTag, setConditionTag] = useState("SALEABLE");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const result = await createSrn({ warehouseId: Number(warehouseId) });
      setSession(result);
    } catch (err) {
      setError(err?.message || "Failed to create SRN");
    } finally {
      setCreating(false);
    }
  }

  async function handleScan(serialNo) {
    const result = (await scanSrnSerial({
      srnId: session?.srnId,
      serialNo,
      conditionTag
    })) || {};
    if (result.valid) {
      return {
        status: "ACCEPTED",
        message: `Return accepted (${result.conditionTag || conditionTag})`,
        state: "success"
      };
    }
    return {
      status: result.alert?.ruleCode || "REJECTED",
      message: result.alert?.message || "Return rejected",
      state: "error"
    };
  }

  if (session) {
    return (
      <div>
        <PageHeader title="Customer Returns" subtitle="Scan and process returned serials" />
        <Card title={`SRN #${session.srnId ?? "—"}`}>
          <ScanSession
            module="SRN"
            title={`SRN ${session.srnId ?? "—"} — ${session.status ?? "PENDING"}`}
            onScan={handleScan}
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
          <Input
            label="Receiving Warehouse ID"
            value={warehouseId}
            onChange={setWarehouseId}
            type="number"
            inputMode="numeric"
            placeholder="Enter warehouse ID"
          />
          <div>
            <label
              htmlFor="srn-condition-tag"
              className="input__label"
              style={{ display: "block", marginBottom: "var(--space-2)" }}
            >
              Condition Tag
            </label>
            <select
              id="srn-condition-tag"
              value={conditionTag}
              onChange={(e) => setConditionTag(e.target.value)}
              className="input"
              style={{ width: "100%" }}
            >
              {CONDITION_TAGS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!warehouseId || creating}>
            {creating ? "Creating..." : "Start SRN"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
