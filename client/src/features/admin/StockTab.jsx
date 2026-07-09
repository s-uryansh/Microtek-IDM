import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { toCsv, downloadCsv } from "../../utils/csv.js";
import { fetchWarehouseStock } from "../../api/modules/admin.js";
import { toArray } from "./adminShared.js";

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
  { key: "serialStatus", label: "Status" }
];

export function StockTab() {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [search, setSearch] = useState("");

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
  const rows = items
    .filter((unit) => !warehouseFilter || String(unit.warehouseId) === String(warehouseFilter))
    .filter((unit) => {
      if (!query) return true;
      return [unit.serialNo, unit.productName, unit.productCode, unit.warehouseCode].some((value) =>
        String(value ?? "").toLowerCase().includes(query)
      );
    })
    .map((unit) => ({
      ...unit,
      warehouseCode: `${unit.warehouseCode}${unit.warehouseName ? ` · ${unit.warehouseName}` : ""}`,
      serialStatus: <span className="badge">{unit.serialStatus || "—"}</span>
    }));

  function handleExportCsv() {
    downloadCsv(
      "warehouse-stock-export.csv",
      toCsv(stockColumns, items
        .filter((unit) => !warehouseFilter || String(unit.warehouseId) === String(warehouseFilter))
        .filter((unit) => {
          if (!query) return true;
          return [unit.serialNo, unit.productName, unit.productCode, unit.warehouseCode].some((value) =>
            String(value ?? "").toLowerCase().includes(query)
          );
        })
        .map((unit) => ({
          ...unit,
          warehouseCode: `${unit.warehouseCode}${unit.warehouseName ? ` · ${unit.warehouseName}` : ""}`
        })))
    );
  }

  return (
    <div>
      <Card title="Warehouse Stock — every unit currently in stock">
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: 0 }}>
          Each individual product unit (serial number) that is currently IN_STOCK, and the
          warehouse it physically sits in.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <Button variant="secondary" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>
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
