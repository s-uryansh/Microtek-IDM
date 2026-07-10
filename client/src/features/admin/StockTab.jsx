import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { toCsv, downloadCsv } from "../../utils/csv.js";
import { fetchWarehouseStock } from "../../api/modules/admin.js";
import { toArray } from "./adminShared.js";

const MAX_EXPORT_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

// Span (in days) between two "YYYY-MM-DD" date-input values.
function daySpan(fromDate, toDate) {
  return Math.round((new Date(toDate) - new Date(fromDate)) / MS_PER_DAY);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const stockColumns = [
  { key: "warehouseCode", label: "Warehouse" },
  { key: "productName", label: "Product" },
  { key: "productCode", label: "Code" },
  {
    key: "category",
    label: "Category",
    render: (value, row) => <span className="badge">{value || row.segment || "—"}</span>
  },
  { key: "serialNo", label: "Serial Number", filterable: false },
  { key: "serialStatus", label: "Status" },
  { key: "receivedAt", label: "Added On", render: formatDate, filterable: false }
];

export function StockTab() {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchWarehouseStock()
      .then((data) => setStock(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load warehouse stock"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = toArray(stock?.items);

  // Distinct warehouses present in the stock, for the filter dropdown.
  const warehouseOptions = [...new Map(
    items.map((unit) => [unit.warehouseId, { warehouseId: unit.warehouseId, code: unit.warehouseCode, name: unit.warehouseName }])
  ).values()];

  const query = search.trim().toLowerCase();
  const filteredItems = items
    .filter((unit) => !warehouseFilter || String(unit.warehouseId) === String(warehouseFilter))
    .filter((unit) => {
      if (!query) return true;
      return [unit.serialNo, unit.productName, unit.productCode, unit.warehouseCode].some((value) =>
        String(value ?? "").toLowerCase().includes(query)
      );
    });

  const rows = filteredItems.map((unit) => ({
    ...unit,
    warehouseCode: `${unit.warehouseCode}${unit.warehouseName ? ` · ${unit.warehouseName}` : ""}`,
    serialStatus: <span className="badge">{unit.serialStatus || "—"}</span>
  }));

  // "Till" is capped 90 days after "From" via the native date input max, but a
  // missing/invalid pair is checked again here since the export button can
  // still be reached with an empty or hand-edited range.
  const exportRangeValid = Boolean(exportFrom) && Boolean(exportTo) &&
    daySpan(exportFrom, exportTo) >= 0 && daySpan(exportFrom, exportTo) <= MAX_EXPORT_DAYS;

  function handleExportCsv() {
    if (!exportRangeValid) return;
    const from = new Date(`${exportFrom}T00:00:00`);
    const to = new Date(`${exportTo}T23:59:59.999`);
    const rowsInRange = filteredItems
      .filter((unit) => unit.receivedAt && new Date(unit.receivedAt) >= from && new Date(unit.receivedAt) <= to)
      .map((unit) => ({
        ...unit,
        warehouseCode: `${unit.warehouseCode}${unit.warehouseName ? ` · ${unit.warehouseName}` : ""}`,
        receivedAt: formatDate(unit.receivedAt)
      }));
    downloadCsv(`warehouse-stock-export_${exportFrom}_to_${exportTo}.csv`, toCsv(stockColumns, rowsInRange));
  }

  return (
    <div>
      <Card title="Warehouse Stock: every unit currently in stock">
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: 0 }}>
          Each individual product unit (serial number) that is currently IN_STOCK, and the
          warehouse it physically sits in.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: "var(--space-3)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          <div className="input-group">
            <label className="input-group__label" htmlFor="stock-export-from">Export From</label>
            <input
              id="stock-export-from"
              type="date"
              className="input"
              value={exportFrom}
              max={exportTo || undefined}
              onChange={(e) => {
                const value = e.target.value;
                setExportFrom(value);
                if (value && exportTo && daySpan(value, exportTo) > MAX_EXPORT_DAYS) {
                  setExportTo(addDays(value, MAX_EXPORT_DAYS));
                }
              }}
            />
          </div>
          <div className="input-group">
            <label className="input-group__label" htmlFor="stock-export-to">Export Till</label>
            <input
              id="stock-export-to"
              type="date"
              className="input"
              value={exportTo}
              min={exportFrom || undefined}
              max={exportFrom ? addDays(exportFrom, MAX_EXPORT_DAYS) : undefined}
              onChange={(e) => setExportTo(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={handleExportCsv} disabled={!exportRangeValid}>
            Export CSV
          </Button>
        </div>
        {!exportRangeValid && (exportFrom || exportTo) && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-error)", marginTop: "calc(-1 * var(--space-2))", marginBottom: "var(--space-3)" }}>
            Select a From and Till date, up to {MAX_EXPORT_DAYS} days apart, to export.
          </p>
        )}
        <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          <div className="input-group" style={{ minWidth: 220 }}>
            <label className="input-group__label">Warehouse</label>
            <select
              className="input"
              aria-label="Filter by warehouse"
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouseOptions.map((wh) => (
                <option key={wh.warehouseId} value={wh.warehouseId}>
                  {wh.code}{wh.name ? ` · ${wh.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 260, flex: 1 }}>
            <Input
              label="Search"
              value={search}
              onChange={setSearch}
              placeholder="Search by serial, product or code"
            />
          </div>
        </div>
        <DataTable
          columns={stockColumns}
          data={rows}
          loading={loading}
          error={error}
          onRetry={load}
          pageSize={20}
          sortable={true}
        />
      </Card>
    </div>
  );
}
