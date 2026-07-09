import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { Collapsible } from "../../components/ui/Collapsible.jsx";
import { toCsv, downloadCsv } from "../../utils/csv.js";
import {
  fetchWarehouses,
  createWarehouse,
  deactivateWarehouse,
  reactivateWarehouse
} from "../../api/modules/admin.js";
import { toArray } from "./adminShared.js";

const warehouseColumns = [
  { key: "warehouseId", label: "ID" },
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "unitCount", label: "Units in stock" },
  { key: "isActive", label: "Status" },
  { key: "createdAt", label: "Created" }
];

export function WarehousesTab() {
  const [warehouses, setWarehouses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [whType, setWhType] = useState("REGIONAL");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchWarehouses()
      .then((data) => setWarehouses(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load warehouses"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);
    try {
      await createWarehouse({ code, name, type: whType });
      setCode("");
      setName("");
      setWhType("REGIONAL");
      load();
    } catch (err) {
      setCreateError(err?.message || "Failed to create warehouse");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(wh) {
    try {
      if (wh.isActive) {
        await deactivateWarehouse(wh.warehouseId);
      } else {
        await reactivateWarehouse(wh.warehouseId);
      }
      load();
    } catch (err) {
      setError(err?.message || "Failed to update warehouse");
    }
  }

  const query = search.trim().toLowerCase();
  const filteredItems = toArray(warehouses?.items).filter((wh) => {
    if (!query) return true;
    return [wh.code, wh.name, wh.type, wh.warehouseId, wh.unitCount].some((value) =>
      String(value ?? "").toLowerCase().includes(query)
    );
  });

  const rows = filteredItems.map((wh) => ({
    ...wh,
    isActive: wh.isActive ? (
      <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Active</span>
    ) : (
      <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Inactive</span>
    ),
    createdAt: new Date(wh.createdAt).toLocaleDateString(),
    _actions: (
      <Button
        variant={wh.isActive ? "danger" : "secondary"}
        size="sm"
        onClick={() => handleToggle(wh)}
      >
        {wh.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    )
  }));

  const displayColumns = [
    ...warehouseColumns,
    { key: "_actions", label: "Actions", sortable: false }
  ];

  function handleExportCsv() {
    downloadCsv(
      "warehouses-export.csv",
      toCsv(warehouseColumns, filteredItems.map((wh) => ({
        ...wh,
        isActive: wh.isActive ? "Active" : "Inactive",
        createdAt: new Date(wh.createdAt).toLocaleDateString()
      })))
    );
  }

  return (
    <div>
      <Card title="Warehouse List">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-end", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 360, flex: 1 }}>
            <Input
              label="Search warehouses"
              value={search}
              onChange={setSearch}
              placeholder="Search by code, name, type or units"
            />
          </div>
          <Button variant="secondary" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>
        <DataTable
          columns={displayColumns}
          data={rows}
          loading={loading}
          error={error}
          onRetry={load}
          pageSize={10}
          sortable={true}
        />
      </Card>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Collapsible title="Add Warehouse" openLabel="+ Add Warehouse" closeLabel="Cancel">
          <Card title="Add Warehouse">
            <div className="scan-workflow-form" style={{ maxWidth: 400 }}>
              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                <Input label="Code" value={code} onChange={setCode} placeholder="e.g. RW-04" />
                <div className="input-group" style={{ flex: 1 }}>
                  <label className="input-group__label">Type</label>
                  <select
                    value={whType}
                    onChange={(e) => setWhType(e.target.value)}
                    className="input"
                    aria-label="Warehouse type"
                  >
                    <option value="PLANT">PLANT</option>
                    <option value="CENTRAL">CENTRAL</option>
                    <option value="REGIONAL">REGIONAL</option>
                  </select>
                </div>
              </div>
              <Input label="Name" value={name} onChange={setName} placeholder="e.g. Regional Warehouse 04" />
              {createError && (
                <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{createError}</p>
              )}
              <Button onClick={handleCreate} disabled={!code.trim() || !name.trim() || creating}>
                {creating ? "Adding..." : "Add Warehouse"}
              </Button>
            </div>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}
