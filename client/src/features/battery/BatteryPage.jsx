import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { LookupSelector } from "../../components/operations/LookupSelector.jsx";
import { BulkCsvTools } from "../../components/operations/BulkCsvTools.jsx";
import { commitBatterySerial, fetchBatteryCommitStatus } from "../../api/modules/battery.js";
import { searchInvoices } from "../../api/modules/lookups.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function BatteryPage() {
  const [invoiceLineId, setInvoiceLineId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [commitStatus, setCommitStatus] = useState(null);
  const [error, setError] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [commitRows, setCommitRows] = useState([]);

  async function handleScan(serialNo) {
    if (!invoiceLineId) {
      return { status: "ERROR", message: "Invoice line ID is required", state: "error" };
    }

    const res = await commitBatterySerial({
      invoiceLineId: Number(invoiceLineId),
      serialNo
    });
    setCommitRows((rows) => [...rows, {
      serial_no: serialNo,
      invoice_line_id: invoiceLineId,
      status: res?.status || res?.alert?.ruleCode || "REJECTED",
      message: res?.alert?.message || (res?.valid ? "Battery serial committed" : "Commit failed")
    }]);

    if (res?.valid) {
      return {
        status: res.status || "COMMITTED",
        message: "Battery serial committed",
        state: "success"
      };
    }

    return {
      status: res?.alert?.ruleCode || "REJECTED",
      message: res?.alert?.message || "Commit failed",
      state: "error"
    };
  }

  async function handleCheckStatus() {
    setError(null);
    setCommitStatus(null);
    try {
      const res = await fetchBatteryCommitStatus({ invoiceId: Number(invoiceId) });
      setCommitStatus(res);
    } catch (err) {
      setError(err?.message || "Failed to fetch commit status");
    }
  }

  return (
    <div>
      <PageHeader title="Battery Pre-Billing" subtitle="Commit battery serials to invoices" />

      <div className="warehouse-grid warehouse-grid--two">
        <Card title="Commit Battery Serial">
          <div className="scan-workflow-form">
            <LookupSelector
              title="Search Battery Invoice"
              placeholder="Invoice reference or invoice ID"
              search={(query) => searchInvoices({ query, batteryOnly: true })}
              onSelect={(invoice) => {
                setSelectedInvoice(invoice);
                setInvoiceId(String(invoice.invoiceId));
                const batteryLine = invoice.lines?.find((line) => line.isBattery);
                if (batteryLine) setInvoiceLineId(String(batteryLine.invoiceLineId));
              }}
              renderItem={(invoice) => (
                <>
                  <span className="operation-panel__result-title">{invoice.sapInvoiceRef}</span>
                  <span className="operation-panel__result-meta">
                    Invoice #{invoice.invoiceId} · Warehouse {invoice.warehouseCode || invoice.warehouseId}
                  </span>
                </>
              )}
            />
            {selectedInvoice?.lines?.length > 0 && (
              <div className="operation-panel" aria-label="Battery invoice lines">
                <h3 className="operation-panel__title">Select Battery Line</h3>
                <div className="operation-panel__results">
                  {selectedInvoice.lines.filter((line) => line.isBattery).map((line) => (
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
              placeholder="Enter invoice line ID"
            />
            <BulkCsvTools
              title="Battery Bulk Commit Fallback"
              templateFilename="battery-serial-import-template.csv"
              templateHeaders={["serial_no"]}
              importLabel="Import Serials"
              exportLabel="Export Committed Serials"
              exportFilename="battery-committed-serials.csv"
              exportHeaders={["serial_no", "invoice_line_id", "status", "message"]}
              exportRows={commitRows}
              disabled={!invoiceLineId}
              onImportRow={(row) => handleScan(row.serial_no)}
            />
            <ScanSession
              module="BATTERY"
              title="Battery commit scanning"
              onScan={handleScan}
              placeholder="Scan battery serial number"
              disabled={!invoiceLineId}
              disabledMessage="Select an invoice line or enter Invoice Line ID before scanning battery serials."
            />
            {error && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>}
          </div>
        </Card>

        <Card title="Check Commit Status">
          <div className="scan-workflow-form">
            <Input
              label="Invoice ID"
              value={invoiceId}
              onChange={setInvoiceId}
              type="number"
              inputMode="numeric"
              placeholder="Enter invoice ID"
            />
            <Button onClick={handleCheckStatus} disabled={!invoiceId}>
              Check Status
            </Button>
            {commitStatus && (
              <div>
                <p style={{ color: "var(--color-text-secondary)" }}>
                  Invoice #{commitStatus.invoiceId ?? "—"}
                </p>
                <p style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                  {safeNumber(commitStatus.committedQuantity)}
                </p>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
                  serials committed
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
