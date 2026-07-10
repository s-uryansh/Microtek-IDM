import { Card } from "../../components/ui/Card.jsx";
import { orNA, fmtNumberPlain } from "./adminShared.js";
import { PodDocumentBox } from "./PodDocumentBox.jsx";

function fmtDateTime(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  const date = d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(/ /g, "-");
  const time = d.toLocaleTimeString("en-GB", { hour12: false });
  return `${date} , ${time}`;
}

function fmtLrNoAndDate(lrNo, lrDate) {
  if (lrNo && lrDate) return `${lrNo} / ${lrDate}`;
  return lrNo || lrDate || "N/A";
}

export function InvoiceDetailPanel({ row }) {
  const inv = row._invoice;
  const basicInfo = [
    ["Uploaded Date", fmtDateTime(inv.uploadedDate || inv.createdAt)],
    ["Order ID", orNA(inv.orderId)],
    ["Customer Name", orNA(inv.customerName)],
    ["Customer Code", orNA(inv.customerCode)],
    ["Billing Date", orNA(inv.billingDate)],
    ["Billing Number", orNA(inv.billingNumber)],
    ["Division", orNA(inv.division)],
    ["Total Sale QTY", fmtNumberPlain(inv.totalSaleQty)],
    ["Item Total", fmtNumberPlain(inv.itemTotal)],
    ["Total Amt", fmtNumberPlain(inv.totalAmt)],
    ["Transport Name", orNA(inv.transportName)],
    ["LR no and Date", fmtLrNoAndDate(inv.lrNo, inv.lrDate)],
    ["Dispatch Date", orNA(inv.dispatchDate)],
    ["Delivery Date", orNA(inv.deliveryDate)],
    ["Sales Order QTY", fmtNumberPlain(inv.salesOrderQty)],
    ["POD Status", orNA(inv.podStatus)]
  ];
  return (
    <div>
      <Card title={`Invoice #${row.invoiceId} — Basic Information`}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "var(--space-3)"
          }}
        >
          {basicInfo.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{label}</div>
              <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Card title="Item Information">
          <table className="data-table__table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>S.No.</th>
                <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Material Name</th>
                <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Material Code</th>
                <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Category</th>
                <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Bill QTY</th>
                <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>UOM</th>
                <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Amount</th>
                <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Numbers</th>
              </tr>
            </thead>
            <tbody>
              {row._lines.length === 0 && (
                <tr className="data-table__row">
                  <td colSpan={8} style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--color-text-muted)" }}>
                    No line items
                  </td>
                </tr>
              )}
              {row._lines.flatMap((line) => {
                const serials = Array.isArray(line.serialNos) ? line.serialNos : [];
                const returnedSet = new Set(Array.isArray(line.returnedSerialNos) ? line.returnedSerialNos : []);
                const rowCount = Math.max(serials.length, 1);
                return Array.from({ length: rowCount }).map((_, serialIndex) => (
                  <tr key={`${line.invoiceLineId}-${serials[serialIndex] || serialIndex}`} className="data-table__row">
                    {serialIndex === 0 && (
                      <>
                        <td rowSpan={rowCount} style={{ padding: "var(--space-2)" }}>{line.lineNo}</td>
                        <td rowSpan={rowCount} style={{ padding: "var(--space-2)", fontWeight: 600 }}>{line.productName}</td>
                        <td rowSpan={rowCount} style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                          {line.productCode}
                        </td>
                        <td rowSpan={rowCount} style={{ padding: "var(--space-2)" }}>
                          <span className="badge">{line.category || line.segment || "—"}</span>
                        </td>
                        <td rowSpan={rowCount} style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {Number(line.quantity).toFixed(3)}
                        </td>
                        <td rowSpan={rowCount} style={{ padding: "var(--space-2)" }}>{line.uom || "—"}</td>
                        <td rowSpan={rowCount} style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {fmtNumberPlain(line.amount)}
                        </td>
                      </>
                    )}
                    <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                      {serials[serialIndex] || "—"}
                      {serials[serialIndex] && returnedSet.has(serials[serialIndex]) && (
                        <span
                          className="status-badge status-badge--returned"
                          style={{ marginLeft: "var(--space-2)", fontSize: "0.6875rem", fontFamily: "var(--font-sans)" }}
                        >
                          returned
                        </span>
                      )}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ marginTop: "var(--space-4)" }}>
        <PodDocumentBox />
      </div>
    </div>
  );
}
