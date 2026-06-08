import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { LookupSelector } from "../../components/operations/LookupSelector.jsx";
import { BulkCsvTools } from "../../components/operations/BulkCsvTools.jsx";
import { createDispatch, scanDispatchSerial, completeDispatch } from "../../api/modules/dispatch.js";
import { searchInvoices } from "../../api/modules/lookups.js";

export function DispatchPage() {
  const [invoiceId, setInvoiceId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceLineId, setInvoiceLineId] = useState("");
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [scanRows, setScanRows] = useState([]);

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
    setScanRows((rows) => [...rows, {
      serial_no: serialNo,
      invoice_line_id: invoiceLineId,
      status: result.status || result.alert?.ruleCode || "REJECTED",
      message: result.alert?.message || (result.valid ? "Serial dispatched" : "Scan rejected")
    }]);
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
            {selectedInvoice?.lines?.length > 0 && (
              <div className="operation-panel" aria-label="Invoice lines">
                <h3 className="operation-panel__title">Select Invoice Line</h3>
                <div className="operation-panel__results">
                  {selectedInvoice.lines.map((line) => (
                    <button
                      key={line.invoiceLineId}
                      type="button"
                      className="operation-panel__result"
                      onClick={() => setInvoiceLineId(String(line.invoiceLineId))}
                    >
                      <span className="operation-panel__result-title">
                        Line {line.lineNo} · {line.productCode}
                      </span>
                      <span className="operation-panel__result-meta">
                        Line ID {line.invoiceLineId} · Qty {line.quantity}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Input
              label="Invoice Line ID"
              value={invoiceLineId}
              onChange={setInvoiceLineId}
              type="number"
              inputMode="numeric"
              placeholder="Enter invoice line ID for each scan"
            />
            <BulkCsvTools
              title="Dispatch Bulk Serial Fallback"
              templateFilename="dispatch-serial-import-template.csv"
              templateHeaders={["serial_no"]}
              importLabel="Import Serials"
              exportLabel="Export Dispatched Serials"
              exportFilename={`dispatch-${session.dispatchId ?? "session"}-serials.csv`}
              exportHeaders={["serial_no", "invoice_line_id", "status", "message"]}
              exportRows={scanRows}
              disabled={!invoiceLineId}
              onImportRow={(row) => handleScan(row.serial_no)}
            />
          </div>
          <ScanSession
            module="DISPATCH"
            title={`Dispatch ${session.dispatchId ?? "—"} — ${session.status ?? "PENDING"}`}
            onScan={handleScan}
            onComplete={session.status !== "DISPATCHED" ? handleComplete : undefined}
            completed={session.status === "DISPATCHED"}
            disabled={!invoiceLineId}
            disabledMessage="Select an invoice line or enter Invoice Line ID before scanning dispatch serials."
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
              const firstLine = invoice.lines?.[0];
              if (firstLine) setInvoiceLineId(String(firstLine.invoiceLineId));
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
          {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          <Button onClick={handleCreate} disabled={!invoiceId || !warehouseId || creating}>
            {creating ? "Creating..." : "Start Dispatch"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
