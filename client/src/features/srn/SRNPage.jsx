import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { LookupSelector } from "../../components/operations/LookupSelector.jsx";
import { BulkCsvTools } from "../../components/operations/BulkCsvTools.jsx";
import { createSrn, scanSrnSerial } from "../../api/modules/srn.js";
import { searchDispatches, searchInvoices } from "../../api/modules/lookups.js";

const CONDITION_TAGS = ["SALEABLE", "DEFECTIVE", "REPAIR"];

export function SRNPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [conditionTag, setConditionTag] = useState("SALEABLE");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [returnRows, setReturnRows] = useState([]);

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

  async function handleScan(serialNo, rowConditionTag = conditionTag) {
    const result = (await scanSrnSerial({
      srnId: session?.srnId,
      serialNo,
      conditionTag: rowConditionTag
    })) || {};
    setReturnRows((rows) => [...rows, {
      serial_no: serialNo,
      condition_tag: rowConditionTag,
      status: result.valid ? "ACCEPTED" : (result.alert?.ruleCode || "REJECTED"),
      message: result.alert?.message || (result.valid ? "Return accepted" : "Return rejected")
    }]);
    if (result.valid) {
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

  if (session) {
    return (
      <div>
        <PageHeader title="Customer Returns" subtitle="Scan and process returned serials" />
        <Card title={`SRN #${session.srnId ?? "—"}`}>
          <div className="scan-workflow-form scan-workflow-form--compact">
            <ConditionTagSelect value={conditionTag} onChange={setConditionTag} />
            <BulkCsvTools
              title="SRN Bulk Return Fallback"
              templateFilename="srn-return-import-template.csv"
              templateHeaders={["serial_no", "condition_tag"]}
              importLabel="Import Returns"
              exportLabel="Export Processed Returns"
              exportFilename={`srn-${session.srnId ?? "session"}-returns.csv`}
              exportHeaders={["serial_no", "condition_tag", "status", "message"]}
              exportRows={returnRows}
              onImportRow={(row) => handleScan(row.serial_no, row.condition_tag || conditionTag)}
            />
          </div>
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
          <LookupSelector
            title="Search Original Invoice"
            placeholder="Invoice reference or invoice ID"
            search={(query) => searchInvoices({ query })}
            onSelect={(invoice) => setWarehouseId(String(invoice.warehouseId))}
            renderItem={(invoice) => (
              <>
                <span className="operation-panel__result-title">{invoice.sapInvoiceRef}</span>
                <span className="operation-panel__result-meta">
                  Invoice #{invoice.invoiceId} · Receiving warehouse {invoice.warehouseCode || invoice.warehouseId}
                </span>
              </>
            )}
          />
          <LookupSelector
            title="Search Original Dispatch"
            placeholder="Dispatch ID or invoice reference"
            search={(query) => searchDispatches({ query })}
            onSelect={(dispatch) => setWarehouseId(String(dispatch.warehouseId))}
            renderItem={(dispatch) => (
              <>
                <span className="operation-panel__result-title">Dispatch #{dispatch.dispatchId}</span>
                <span className="operation-panel__result-meta">
                  Invoice {dispatch.sapInvoiceRef} · Warehouse {dispatch.warehouseCode || dispatch.warehouseId}
                </span>
              </>
            )}
          />
          <Input
            label="Receiving Warehouse ID"
            value={warehouseId}
            onChange={setWarehouseId}
            type="number"
            inputMode="numeric"
            placeholder="Enter warehouse ID"
          />
          <ConditionTagSelect value={conditionTag} onChange={setConditionTag} />
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!warehouseId || creating}>
            {creating ? "Creating..." : "Start SRN"}
          </Button>
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
