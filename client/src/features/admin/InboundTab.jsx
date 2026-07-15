import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { toCsv, downloadCsv } from "../../utils/csv.js";
import { fetchInboundDispatches } from "../../api/modules/admin.js";
import { toArray, fmtDate } from "./adminShared.js";

const STATUS_LABELS = {
  IN_STOCK: "In Stock",
  IN_TRANSIT: "In Transit",
  DISPATCHED: "Dispatched",
  RETURNED: "Returned",
  PRODUCED: "Produced",
  IMPORTED: "Imported",
  GRN_IN_PROGRESS: "GRN In Progress",
  GRN_CLOSED: "GRN Closed",
};

function statusLabel(status) {
  if (!status) return status;
  return STATUS_LABELS[status] || status;
}

// The stored sap_dispatch_doc.status is "IMPORTED" as soon as the SAP dispatch is
// imported, but the physical stock is still IN_TRANSIT until a GRN receives every
// serial into stock. Derive the displayed status from the serial states so the row
// only reads "Imported" once ALL serials are IN_STOCK; otherwise it reflects that
// stock is still in transit. Falls back to the stored status when no serials exist.
function deriveDisplayStatus(doc) {
  const serialStatuses = toArray(doc.lines)
    .map((line) => line.serialStatus)
    .filter(Boolean);
  if (serialStatuses.length === 0) return doc.status;
  const allInStock = serialStatuses.every((s) => s === "IN_STOCK");
  // Every serial received into stock: keep the stored status ("IMPORTED").
  if (allInStock) return doc.status;
  // Any serial still not in stock: the dispatch is physically in transit.
  return "IN_TRANSIT";
}

const inboundColumns = [
  { key: "externalRef", label: "Dispatch Doc" },
  { key: "sourceWarehouseCode", label: "From" },
  { key: "destinationWarehouseCode", label: "To (Warehouse)" },
  { key: "_products", label: "Products", sortable: false },
  { key: "totalQuantity", label: "Total Qty" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Import Date" }
];

export function InboundTab() {
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchInboundDispatches()
      .then((data) => setDocs(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load inbound stock"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = toArray(docs?.items).map((doc) => ({
    sapDispatchDocId: doc.sapDispatchDocId,
    externalRef: doc.externalRef,
    sourceWarehouseCode: doc.sourceWarehouseCode || (doc.sourceWarehouseId ? `WH-${doc.sourceWarehouseId}` : "—"),
    destinationWarehouseCode: `${doc.destinationWarehouseCode || `WH-${doc.destinationWarehouseId}`}${doc.destinationWarehouseName ? ` · ${doc.destinationWarehouseName}` : ""}`,
    totalQuantity: doc.totalQuantity,
    status: <StatusBadge status={statusLabel(deriveDisplayStatus(doc))} />,
    createdAt: fmtDate(doc.createdAt),
    _products: (
      <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {toArray(doc.products).map((p) => `${p.productName} ×${p.quantity}`).join(", ") || "—"}
      </span>
    ),
    _doc: doc
  }));

  const inboundCsvColumns = [
    { key: "externalRef", label: "Dispatch Doc" },
    { key: "sourceWarehouseCode", label: "From" },
    { key: "destinationWarehouseCode", label: "To (Warehouse)" },
    { key: "products", label: "Products" },
    { key: "totalQuantity", label: "Total Qty" },
    { key: "status", label: "Status" },
    { key: "createdAt", label: "Import Date" }
  ];

  function handleExportCsv() {
    downloadCsv(
      "inbound-stock-export.csv",
      toCsv(inboundCsvColumns, toArray(docs?.items).map((doc) => ({
        externalRef: doc.externalRef,
        sourceWarehouseCode: doc.sourceWarehouseCode || (doc.sourceWarehouseId ? `WH-${doc.sourceWarehouseId}` : "—"),
        destinationWarehouseCode: `${doc.destinationWarehouseCode || `WH-${doc.destinationWarehouseId}`}${doc.destinationWarehouseName ? ` · ${doc.destinationWarehouseName}` : ""}`,
        products: toArray(doc.products).map((p) => `${p.productName} x${p.quantity}`).join("; ") || "—",
        totalQuantity: doc.totalQuantity,
        status: statusLabel(deriveDisplayStatus(doc)),
        createdAt: fmtDate(doc.createdAt)
      })))
    );
  }

  return (
    <div>
      <Card title="Inbound Stock: sent to each warehouse">
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: 0 }}>
          SAP dispatch documents: which stock was shipped to which warehouse. Click a row to
          see every serial. These are the serials a GRN at the destination warehouse expects.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <Button variant="secondary" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>
        <DataTable
          columns={inboundColumns}
          data={rows}
          loading={loading}
          error={error}
          onRetry={load}
          pageSize={15}
          sortable={true}
          onRowClick={(row) => setExpanded(expanded === row.sapDispatchDocId ? null : row.sapDispatchDocId)}
        />
      </Card>

      {expanded && (
        <div style={{ marginTop: "var(--space-4)" }}>
          {rows
            .filter((r) => r.sapDispatchDocId === expanded)
            .map((row) => (
              <Card key={row.sapDispatchDocId} title={`${row._doc.externalRef} — Serials`}>
                <table className="data-table__table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>S.No.</th>
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Material Name</th>
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Material Code</th>
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Category</th>
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Number</th>
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toArray(row._doc.lines).length === 0 && (
                      <tr className="data-table__row">
                        <td colSpan={6} style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--color-text-muted)" }}>
                          No serials on this document
                        </td>
                      </tr>
                    )}
                    {toArray(row._doc.lines).map((line) => (
                      <tr key={`${row.sapDispatchDocId}-${line.lineNo}`} className="data-table__row">
                        <td style={{ padding: "var(--space-2)" }}>{line.lineNo}</td>
                        <td style={{ padding: "var(--space-2)", fontWeight: 600 }}>{line.productName}</td>
                        <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                          {line.productCode}
                        </td>
                        <td style={{ padding: "var(--space-2)" }}>
                          <span className="badge">{line.category || line.segment || "—"}</span>
                        </td>
                        <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                          {line.serialNo}
                        </td>
                        <td style={{ padding: "var(--space-2)" }}>
                          <span className="badge">{line.serialStatus || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
