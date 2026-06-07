import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ScanSession } from "../../components/scan/ScanSession.jsx";
import { commitBatterySerial, fetchBatteryCommitStatus } from "../../api/modules/battery.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function BatteryPage() {
  const [invoiceLineId, setInvoiceLineId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [commitStatus, setCommitStatus] = useState(null);
  const [error, setError] = useState(null);

  async function handleScan(serialNo) {
    if (!invoiceLineId) {
      return { status: "ERROR", message: "Invoice line ID is required", state: "error" };
    }

    const res = await commitBatterySerial({
      invoiceLineId: Number(invoiceLineId),
      serialNo
    });

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
            <Input
              label="Invoice Line ID"
              value={invoiceLineId}
              onChange={setInvoiceLineId}
              type="number"
              inputMode="numeric"
              placeholder="Enter invoice line ID"
            />
            <ScanSession
              module="BATTERY"
              title="Battery commit scanning"
              onScan={handleScan}
              placeholder="Scan battery serial number"
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
