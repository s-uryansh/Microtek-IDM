import { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import {
  fetchWarehouses,
  fetchPermissions,
  fetchRoles,
  createRole,
  updateRole,
  fetchMembers,
  createMember,
  updateMember,
  createWarehouse,
  deactivateWarehouse,
  reactivateWarehouse,
  fetchProducts,
  importProductsCsv,
  exportProductsCsv,
  fetchAllInvoices,
  exportInvoicesCsv,
  importInvoicesCsv,
  fetchInboundDispatches,
  fetchWarehouseStock
} from "../../api/modules/admin.js";
import { useAuth } from "../../auth/useAuth.js";

const PRODUCT_IMPORT_TEMPLATE = [
  "product_code,name,segment,category,is_battery,is_active",
  "MTK-0001,Demo Inverter,GENERAL,INVERTER,false,true",
  "MTK-0002,Demo Battery,BATTERY,BATTERY,true,true"
].join("\n");

const INVOICE_IMPORT_TEMPLATE = [
  "sap_invoice_ref,status,order_id,customer_name,customer_code,billing_date,billing_number,division,total_sale_qty,item_total,total_amt,transport_name,lr_no,lr_date,dispatch_date,delivery_date,sales_order_qty,pod_status,line_no,material_code,bill_qty,uom,amount,pod_section,pod_document",
  "MTK-INVOICE-DEMO-001,PENDING,SO-DEMO-1,Demo Customer,CUST-9001,2026-06-01,BILL-9001,POWER PRODUCTS,15,1,75951,Bluedart,LR-9001,2026-06-02,2026-06-02,2026-06-05,15,PENDING,1,899-95N-1075,15,NOS,75951,SEC-A,"
].join("\n");

const TABS = [
  { key: "warehouses", label: "Warehouses" },
  { key: "members", label: "Members" },
  { key: "roles", label: "Roles" },
  { key: "products", label: "Products" },
  { key: "invoices", label: "Invoices" },
  { key: "inbound", label: "Inbound Stock" },
  { key: "stock", label: "Warehouse Stock" }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

const warehouseColumns = [
  { key: "warehouseId", label: "ID" },
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "unitCount", label: "Units in stock" },
  { key: "isActive", label: "Status" },
  { key: "createdAt", label: "Created" }
];

function WarehousesTab() {
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

  return (
    <div>
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

      <div style={{ marginTop: "var(--space-4)" }}>
        <Card title="Warehouse List">
          <div style={{ maxWidth: 360, marginBottom: "var(--space-3)" }}>
            <Input
              label="Search warehouses"
              value={search}
              onChange={setSearch}
              placeholder="Search by code, name, type or units"
            />
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
      </div>
    </div>
  );
}

const productColumns = [
  { key: "productCode", label: "Code" },
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "segment", label: "Segment" },
  { key: "isBattery", label: "Battery" },
  { key: "isActive", label: "Active" }
];

function ProductsTab() {
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchProducts()
      .then((data) => setProducts(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load products"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleExport() {
    try {
      const result = await exportProductsCsv();
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || "Export failed");
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  }

  async function handleImport() {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importProductsCsv({ csvContent: csvText });
      setImportResult(result);
      load();
      setCsvText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setImportResult({ imported: 0, errors: [{ row: 0, message: err?.message || "Import failed" }] });
    } finally {
      setImporting(false);
    }
  }

  function handleDownloadTemplate() {
    const blob = new Blob([PRODUCT_IMPORT_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "product-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const rows = toArray(products?.items).map((p) => ({
    ...p,
    isBattery: p.isBattery ? "Yes" : "No",
    isActive: p.isActive ? "Yes" : "No"
  }));

  return (
    <div>
      <Card title="Import Template">
        <div className="scan-workflow-form" style={{ maxWidth: 640 }}>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
            Use this CSV structure for product imports.
          </p>
          <pre
            style={{
              margin: 0,
              padding: "var(--space-3)",
              backgroundColor: "var(--color-surface-subtle)",
              borderRadius: "var(--radius-md)",
              overflowX: "auto",
              fontSize: "0.8125rem"
            }}
          >
            {PRODUCT_IMPORT_TEMPLATE}
          </pre>
          <Button variant="secondary" onClick={handleDownloadTemplate}>
            Download Template
          </Button>
        </div>
      </Card>

      <Card title="Import / Export Products">
        <div className="scan-workflow-form" style={{ maxWidth: 500 }}>
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end" }}>
            <Button variant="secondary" onClick={handleExport}>
              Export CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Choose CSV File
            </Button>
          </div>
          {csvText && (
            <div>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                File loaded ({csvText.length} chars). Click Import to process.
              </p>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "Importing..." : "Import Products"}
              </Button>
            </div>
          )}
          {importResult && (
            <div
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                backgroundColor:
                  importResult.errors?.length > 0
                    ? "var(--color-warning-subtle)"
                    : "var(--color-success-subtle)",
                fontSize: "0.875rem"
              }}
            >
              <p>Imported: {importResult.imported} products</p>
              {importResult.errors?.length > 0 && (
                <div style={{ marginTop: "var(--space-2)" }}>
                  <p style={{ fontWeight: 600 }}>Errors:</p>
                  {importResult.errors.map((err, i) => (
                    <p key={i} style={{ color: "var(--color-error)", fontSize: "0.8125rem" }}>
                      Row {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Card title="Product List">
          <DataTable
            columns={productColumns}
            data={rows}
            loading={loading}
            error={error}
            onRetry={load}
            pageSize={10}
            sortable={true}
          />
        </Card>
      </div>
    </div>
  );
}

const memberColumns = [
  { key: "username", label: "Username" },
  { key: "displayName", label: "Display Name" },
  { key: "roleName", label: "Role" },
  { key: "defaultWarehouseLabel", label: "Default Warehouse" },
  { key: "warehouseSummary", label: "Warehouses" },
  { key: "isActive", label: "Status" }
];

function warehouseLabel(warehouse) {
  if (!warehouse) return "—";
  return `${warehouse.code} · ${warehouse.name}`;
}

function MembersTab() {
  const [members, setMembers] = useState(null);
  const [roles, setRoles] = useState(null);
  const [warehouses, setWarehouses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    roleId: "",
    defaultWarehouseId: "",
    isActive: true
  });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchMembers({ query }),
      fetchRoles(),
      fetchWarehouses()
    ])
      .then(([memberData, roleData, warehouseData]) => {
        setMembers(memberData ?? { items: [] });
        setRoles(roleData ?? { items: [] });
        setWarehouses(warehouseData ?? { items: [] });
      })
      .catch((err) => setError(err?.message || "Failed to load members"))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  function startNewMember() {
    setSelectedUserId(null);
    setForm({
      username: "",
      displayName: "",
      password: "",
      roleId: roles?.items?.[0]?.roleId ? String(roles.items[0].roleId) : "",
      defaultWarehouseId: warehouses?.items?.[0]?.warehouseId ? String(warehouses.items[0].warehouseId) : "",
      isActive: true
    });
    setFormError(null);
  }

  function selectMember(member) {
    setSelectedUserId(member.userId);
    setForm({
      username: member.username || "",
      displayName: member.displayName || "",
      password: "",
      roleId: String(member.roleId || ""),
      defaultWarehouseId: String(member.defaultWarehouseId || member.warehouseIds?.[0] || ""),
      isActive: Boolean(member.isActive)
    });
    setFormError(null);
  }

  useEffect(() => {
    if (!selectedUserId && !form.roleId && roles?.items?.length) {
      setForm((prev) => ({ ...prev, roleId: String(roles.items[0].roleId) }));
    }
    if (!selectedUserId && !form.defaultWarehouseId && warehouses?.items?.length) {
      setForm((prev) => ({ ...prev, defaultWarehouseId: String(warehouses.items[0].warehouseId) }));
    }
  }, [roles, warehouses, selectedUserId, form.roleId, form.defaultWarehouseId]);

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        roleId: Number(form.roleId),
        defaultWarehouseId: form.defaultWarehouseId ? Number(form.defaultWarehouseId) : null,
        warehouseIds: form.defaultWarehouseId ? [Number(form.defaultWarehouseId)] : [],
        isActive: form.isActive
      };

      if (selectedUserId) {
        await updateMember({
          userId: selectedUserId,
          ...payload,
          password: form.password.trim() || undefined
        });
      } else {
        await createMember({
          ...payload,
          password: form.password.trim()
        });
      }
      load();
      startNewMember();
    } catch (err) {
      setFormError(err?.message || "Failed to save member");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(member) {
    try {
      await updateMember({
        userId: member.userId,
        isActive: !member.isActive,
        username: member.username,
        displayName: member.displayName,
        roleId: member.roleId,
        defaultWarehouseId: member.defaultWarehouseId,
        warehouseIds: member.warehouseIds
      });
      load();
    } catch (err) {
      setError(err?.message || "Failed to update member");
    }
  }

  const roleOptions = toArray(roles?.items);
  const warehouseOptions = toArray(warehouses?.items);
  const rows = toArray(members?.items).map((member) => ({
    ...member,
    defaultWarehouseLabel: warehouseLabel(
      warehouseOptions.find((wh) => Number(wh.warehouseId) === Number(member.defaultWarehouseId || member.warehouseIds?.[0]))
    ),
    warehouseSummary: member.warehouseIds?.length
      ? member.warehouseIds
          .map((id) => warehouseLabel(warehouseOptions.find((wh) => Number(wh.warehouseId) === Number(id))))
          .join(", ")
      : "—",
    isActive: member.isActive ? (
      <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Active</span>
    ) : (
      <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Inactive</span>
    ),
    _actions: (
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Button variant="secondary" size="sm" onClick={() => selectMember(member)}>
          Edit
        </Button>
        <Button variant={member.isActive ? "danger" : "secondary"} size="sm" onClick={() => toggleActive(member)}>
          {member.isActive ? "Soft Delete" : "Restore"}
        </Button>
      </div>
    )
  }));

  return (
    <div className="warehouse-grid warehouse-grid--two">
      <Card title="Member Editor">
        <div className="scan-workflow-form">
          <Input label="Search Members" value={query} onChange={setQuery} placeholder="Search username or display name" />
          <Button variant="secondary" onClick={startNewMember}>
            New Member
          </Button>
          <Input label="Username" value={form.username} onChange={(value) => setForm((prev) => ({ ...prev, username: value }))} />
          <Input label="Display Name" value={form.displayName} onChange={(value) => setForm((prev) => ({ ...prev, displayName: value }))} />
          <Input
            label={selectedUserId ? "Password (optional)" : "Password"}
            value={form.password}
            onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
            type="password"
            placeholder={selectedUserId ? "Leave blank to keep current password" : "Set login password"}
          />
          <div className="input-group">
            <label className="input-group__label">Role</label>
            <select
              className="input"
              value={form.roleId}
              onChange={(e) => setForm((prev) => ({ ...prev, roleId: e.target.value }))}
            >
              {roleOptions.map((role) => (
                <option key={role.roleId} value={role.roleId}>
                  {role.code} · {role.name}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-group__label">Default Warehouse</label>
            <select
              className="input"
              value={form.defaultWarehouseId}
              onChange={(e) => setForm((prev) => ({ ...prev, defaultWarehouseId: e.target.value }))}
            >
              {warehouseOptions.map((wh) => (
                <option key={wh.warehouseId} value={wh.warehouseId}>
                  {wh.code} · {wh.name}
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Active
          </label>
          {formError && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{formError}</p>}
          <Button onClick={handleSave} disabled={!form.username.trim() || !form.displayName.trim() || !form.roleId || (!selectedUserId && !form.password.trim()) || saving}>
            {saving ? "Saving..." : selectedUserId ? "Update Member" : "Create Member"}
          </Button>
        </div>
      </Card>

      <Card title="Member List">
        <DataTable
          columns={[...memberColumns, { key: "_actions", label: "Actions", sortable: false }]}
          data={rows}
          loading={loading}
          error={error}
          onRetry={load}
          pageSize={12}
          sortable={true}
          onRowClick={(row) => {
            const member = toArray(members?.items).find((item) => item.userId === row.userId);
            if (member) selectMember(member);
          }}
        />
      </Card>
    </div>
  );
}

const roleColumns = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "memberCount", label: "Members" },
  { key: "permissionCount", label: "Permissions" },
  { key: "isActive", label: "Status" }
];

function RolesTab() {
  const [roles, setRoles] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    isActive: true,
    permissions: []
  });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchRoles(), fetchPermissions()])
      .then(([roleData, permissionData]) => {
        setRoles(roleData ?? { items: [] });
        setPermissions(permissionData ?? { items: [] });
      })
      .catch((err) => setError(err?.message || "Failed to load roles"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNewRole() {
    setSelectedRoleId(null);
    setForm({
      code: "",
      name: "",
      isActive: true,
      permissions: []
    });
    setFormError(null);
  }

  function selectRole(role) {
    setSelectedRoleId(role.roleId);
    setForm({
      code: role.code || "",
      name: role.name || "",
      isActive: Boolean(role.isActive),
      permissions: role.permissions || []
    });
    setFormError(null);
  }

  const permissionOptions = toArray(permissions?.items);
  const rows = toArray(roles?.items)
    .filter((role) => role.code !== "admin")
    .map((role) => ({
    ...role,
    permissionCount: role.permissions?.length || 0,
    isActive: role.isActive ? (
      <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Active</span>
    ) : (
      <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Inactive</span>
    ),
    _actions: (
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Button variant="secondary" size="sm" onClick={() => selectRole(role)}>
          Edit
        </Button>
        <Button
          variant={role.isActive ? "danger" : "secondary"}
          size="sm"
          onClick={async () => {
            try {
              await updateRole({
                roleId: role.roleId,
                isActive: !role.isActive,
                name: role.name,
                permissionCodes: role.permissions
              });
              load();
            } catch (err) {
              setError(err?.message || "Failed to update role");
            }
          }}
        >
          {role.isActive ? "Soft Delete" : "Restore"}
        </Button>
      </div>
    )
  }));

  function togglePermission(permissionCode) {
    setForm((prev) => {
      const next = new Set(prev.permissions);
      if (next.has(permissionCode)) {
        next.delete(permissionCode);
      } else {
        next.add(permissionCode);
      }
      return { ...prev, permissions: Array.from(next) };
    });
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        isActive: form.isActive,
        permissionCodes: form.permissions
      };
      if (selectedRoleId) {
        await updateRole({ roleId: selectedRoleId, ...payload });
      } else {
        await createRole({ code: form.code.trim(), ...payload });
      }
      load();
      startNewRole();
    } catch (err) {
      setFormError(err?.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="warehouse-grid warehouse-grid--two">
      <Card title="Role Editor">
        <div className="scan-workflow-form">
          <Button variant="secondary" onClick={startNewRole}>
            New Role
          </Button>
          {!selectedRoleId && (
            <Input
              label="Role Code"
              value={form.code}
              onChange={(value) => setForm((prev) => ({ ...prev, code: value }))}
              placeholder="e.g. quality_manager"
            />
          )}
          <Input
            label="Role Name"
            value={form.name}
            onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
            placeholder="Display name"
          />
          <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Active
          </label>
          <div className="operation-panel" aria-label="Role permissions">
            <h3 className="operation-panel__title">Permissions</h3>
            <div className="operation-panel__results" style={{ gap: "var(--space-2)" }}>
              {permissionOptions.map((permission) => (
                <label
                  key={permission}
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    alignItems: "center",
                    fontSize: "0.875rem"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                  />
                  {permission}
                </label>
              ))}
            </div>
          </div>
          {formError && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{formError}</p>}
          <Button onClick={handleSave} disabled={!form.name.trim() || (!selectedRoleId && !form.code.trim()) || saving}>
            {saving ? "Saving..." : selectedRoleId ? "Update Role" : "Create Role"}
          </Button>
        </div>
      </Card>

      <Card title="Role List">
        <DataTable
          columns={[...roleColumns, { key: "_actions", label: "Actions", sortable: false }]}
          data={rows}
          loading={loading}
          error={error}
          onRetry={load}
          pageSize={12}
          sortable={true}
          onRowClick={(row) => {
            const role = toArray(roles?.items).find((item) => item.roleId === row.roleId);
            if (role) selectRole(role);
          }}
        />
      </Card>
    </div>
  );
}

const invoiceColumns = [
  { key: "invoiceId", label: "ID" },
  { key: "sapInvoiceRef", label: "Reference" },
  { key: "orderId", label: "Order ID" },
  { key: "customerName", label: "Customer" },
  { key: "billingNumber", label: "Billing No." },
  { key: "_productSummary", label: "Products", sortable: false },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Uploaded" }
];

function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

/* Detail-view formatters that mirror the reference layout (N/A placeholders, plain
   numbers, ISO dates, and a date+time "Uploaded Date"). */
function orNA(value) {
  return value === null || value === undefined || value === "" ? "N/A" : value;
}

function fmtNumberPlain(value) {
  return value === null || value === undefined || value === "" ? "N/A" : Number(value);
}

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

/* Display-only POD Document panel (matches the reference layout). Upload is not
   wired up yet — the edit button just surfaces that it's coming. */
function PodDocumentBox() {
  const [showNote, setShowNote] = useState(false);
  return (
    <Card title="POD Document">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
        <Button variant="secondary" size="sm" onClick={() => setShowNote(true)} aria-label="Edit POD document">
          ✎
        </Button>
      </div>
      <p style={{ textAlign: "center", color: "var(--color-text-muted)", padding: "var(--space-6) 0", margin: 0 }}>
        Currently No Document Found...
      </p>
      {showNote && (
        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          Document upload isn’t enabled yet.
        </p>
      )}
    </Card>
  );
}

function getInvoiceDispatchStatus(inv) {
  const dispatchedQty = Number(inv.dispatchedQty || 0);
  const returnedQty = Number(inv.returnedQty || 0);
  if (dispatchedQty > 0 && returnedQty >= dispatchedQty) return "RETURNED";
  if (returnedQty > 0 && returnedQty < dispatchedQty) return "PARTIAL_RETURN";
  return inv.status || "PENDING";
}

function matchesText(value, query) {
  return String(value ?? "").toLowerCase().includes(query);
}

function InvoicesTab() {
  const { user, hasPermission } = useAuth();
  const isAdmin = (user?.role || user?.roleCode) === "admin";
  const canExportInvoices = isAdmin || hasPermission?.("invoice:export");
  const [invoices, setInvoices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    customer: "",
    dispatchStatus: "",
    billingNumber: "",
    orderId: ""
  });
  const fileInputRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllInvoices()
      .then((data) => setInvoices(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load invoices"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleExport() {
    try {
      const result = await exportInvoicesCsv();
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "invoices-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || "Export failed");
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  }

  async function handleImport() {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importInvoicesCsv({ csvContent: csvText });
      setImportResult(result);
      load();
      setCsvText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setImportResult({ imported: 0, errors: [{ row: 0, message: err?.message || "Import failed" }] });
    } finally {
      setImporting(false);
    }
  }

  function handleDownloadTemplate() {
    const blob = new Blob([INVOICE_IMPORT_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "invoice-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const invoiceItems = toArray(invoices?.items);
  const customerOptions = [...new Set(invoiceItems.map((inv) => inv.customerName).filter(Boolean))].sort();
  const billingOptions = [...new Set(invoiceItems.map((inv) => inv.billingNumber).filter(Boolean))].sort();
  const orderOptions = [...new Set(invoiceItems.map((inv) => inv.orderId).filter(Boolean))].sort();
  const dispatchStatusOptions = [...new Set(invoiceItems.map((inv) => getInvoiceDispatchStatus(inv)).filter(Boolean))].sort();
  const searchQuery = filters.search.trim().toLowerCase();
  const filteredInvoices = invoiceItems.filter((inv) => {
    if (filters.customer && inv.customerName !== filters.customer) return false;
    if (filters.dispatchStatus && getInvoiceDispatchStatus(inv) !== filters.dispatchStatus) return false;
    if (filters.billingNumber && inv.billingNumber !== filters.billingNumber) return false;
    if (filters.orderId && inv.orderId !== filters.orderId) return false;
    if (!searchQuery) return true;
    return [
      inv.invoiceId,
      inv.sapInvoiceRef,
      inv.orderId,
      inv.customerName,
      inv.customerCode,
      inv.billingNumber,
      inv.status
    ].some((value) => matchesText(value, searchQuery));
  });

  const rows = filteredInvoices.map((inv) => {
    const dispatchedQty = Number(inv.dispatchedQty || 0);
    const returnedQty = Number(inv.returnedQty || 0);
    // All dispatched units returned → show RETURNED instead of DISPATCHED.
    // Some (but not all) returned → keep the status tag + a small returned note.
    const fullyReturned = dispatchedQty > 0 && returnedQty >= dispatchedQty;
    const partialReturn = returnedQty > 0 && returnedQty < dispatchedQty;
    return {
    invoiceId: inv.invoiceId,
    sapInvoiceRef: inv.sapInvoiceRef,
    orderId: inv.orderId || "—",
    customerName: inv.customerName || "—",
    billingNumber: inv.billingNumber || "—",
    status: fullyReturned ? (
      <StatusBadge status="RETURNED" />
    ) : (
      <span style={{ display: "inline-flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap" }}>
        <StatusBadge status={inv.status} />
        {partialReturn && (
          <span
            className="status-badge status-badge--returned"
            style={{ fontSize: "0.6875rem" }}
            title={`${returnedQty} of ${dispatchedQty} dispatched unit(s) returned`}
          >
            ↩ {returnedQty} returned
          </span>
        )}
      </span>
    ),
    createdAt: fmtDate(inv.uploadedDate || inv.createdAt),
    _productSummary: (
      <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {inv.lines?.length || 0} line{(inv.lines?.length || 0) !== 1 ? "s" : ""}
      </span>
    ),
    _invoice: inv,
    _lines: inv.lines || []
    };
  });

  const displayColumns = [...invoiceColumns];

  return (
    <div>
      {isAdmin && (
        <Card title="Invoice Bulk CSV (Admin only)">
          <div className="scan-workflow-form" style={{ maxWidth: 640 }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
              Import invoices in bulk. One CSV row per invoice line; invoice header
              columns repeat for each line of the same <code>sap_invoice_ref</code>.
            </p>
            <Button variant="secondary" onClick={handleDownloadTemplate}>
              Download Template
            </Button>
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Choose CSV File
              </Button>
            </div>
            {csvText && (
              <div>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                  File loaded ({csvText.length} chars). Click Import to process.
                </p>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? "Importing..." : "Import Invoices"}
                </Button>
              </div>
            )}
            {importResult && (
              <div
                style={{
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor:
                    importResult.errors?.length > 0
                      ? "var(--color-warning-subtle)"
                      : "var(--color-success-subtle)",
                  fontSize: "0.875rem"
                }}
              >
                <p>
                  Imported: {importResult.imported} invoice{importResult.imported !== 1 ? "s" : ""}
                  {importResult.importedLines !== undefined ? `, ${importResult.importedLines} line items` : ""}
                </p>
                {importResult.errors?.length > 0 && (
                  <div style={{ marginTop: "var(--space-2)" }}>
                    <p style={{ fontWeight: 600 }}>Errors:</p>
                    {importResult.errors.map((err, i) => (
                      <p key={i} style={{ color: "var(--color-error)", fontSize: "0.8125rem" }}>
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <div style={{ marginTop: isAdmin ? "var(--space-4)" : 0 }}>
        <Card title="All Invoices">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-end", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <Input
                label="Search Invoices"
                value={filters.search}
                onChange={(value) => updateFilter("search", value)}
                placeholder="Invoice ref, ID, order ID, customer name..."
              />
            </div>
            {canExportInvoices && (
              <Button variant="secondary" onClick={handleExport}>
                Export CSV
              </Button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-customer">Customer</label>
              <select
                id="invoice-filter-customer"
                className="input"
                value={filters.customer}
                onChange={(e) => updateFilter("customer", e.target.value)}
              >
                <option value="">All customers</option>
                {customerOptions.map((customer) => (
                  <option key={customer} value={customer}>{customer}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-dispatch-status">Dispatch Status</label>
              <select
                id="invoice-filter-dispatch-status"
                className="input"
                value={filters.dispatchStatus}
                onChange={(e) => updateFilter("dispatchStatus", e.target.value)}
              >
                <option value="">All statuses</option>
                {dispatchStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-billing">Billing Number</label>
              <select
                id="invoice-filter-billing"
                className="input"
                value={filters.billingNumber}
                onChange={(e) => updateFilter("billingNumber", e.target.value)}
              >
                <option value="">All billing numbers</option>
                {billingOptions.map((billingNumber) => (
                  <option key={billingNumber} value={billingNumber}>{billingNumber}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-group__label" htmlFor="invoice-filter-order">Order ID</label>
              <select
                id="invoice-filter-order"
                className="input"
                value={filters.orderId}
                onChange={(e) => updateFilter("orderId", e.target.value)}
              >
                <option value="">All order IDs</option>
                {orderOptions.map((orderId) => (
                  <option key={orderId} value={orderId}>{orderId}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button
                variant="secondary"
                onClick={() => setFilters({ search: "", customer: "", dispatchStatus: "", billingNumber: "", orderId: "" })}
              >
                Clear Filters
              </Button>
            </div>
          </div>
          <DataTable
            columns={displayColumns}
            data={rows}
            loading={loading}
            error={error}
            onRetry={load}
            pageSize={15}
            sortable={true}
            onRowClick={(row) => setExpanded(expanded === row.invoiceId ? null : row.invoiceId)}
          />
        </Card>
      </div>

      {expanded && (
        <div style={{ marginTop: "var(--space-4)" }}>
          {rows
            .filter((r) => r.invoiceId === expanded)
            .map((row) => {
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
                <div key={row.invoiceId}>
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
                            <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Bill QTY</th>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>UOM</th>
                            <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Amount</th>
                            <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Numbers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row._lines.length === 0 && (
                            <tr className="data-table__row">
                              <td colSpan={7} style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--color-text-muted)" }}>
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
            })}
        </div>
      )}
    </div>
  );
}

const inboundColumns = [
  { key: "externalRef", label: "Dispatch Doc" },
  { key: "sourceWarehouseCode", label: "From" },
  { key: "destinationWarehouseCode", label: "To (Warehouse)" },
  { key: "_products", label: "Products", sortable: false },
  { key: "totalQuantity", label: "Total Qty" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Imported" }
];

function InboundTab() {
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
    status: <StatusBadge status={doc.status} />,
    createdAt: fmtDate(doc.createdAt),
    _products: (
      <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {toArray(doc.products).map((p) => `${p.productName} ×${p.quantity}`).join(", ") || "—"}
      </span>
    ),
    _doc: doc
  }));

  return (
    <div>
      <Card title="Inbound Stock — sent to each warehouse">
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: 0 }}>
          SAP dispatch documents: which stock was shipped to which warehouse. Click a row to
          see every serial. These are the serials a GRN at the destination warehouse expects.
        </p>
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
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Number</th>
                      <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toArray(row._doc.lines).length === 0 && (
                      <tr className="data-table__row">
                        <td colSpan={5} style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--color-text-muted)" }}>
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

const stockColumns = [
  { key: "warehouseCode", label: "Warehouse" },
  { key: "productName", label: "Product" },
  { key: "productCode", label: "Code" },
  { key: "serialNo", label: "Serial Number" },
  { key: "serialStatus", label: "Status" }
];

function StockTab() {
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

  return (
    <div>
      <Card title="Warehouse Stock — every unit currently in stock">
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: 0 }}>
          Each individual product unit (serial number) that is currently IN_STOCK, and the
          warehouse it physically sits in.
        </p>
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

function AdminModulePage({ title, subtitle, children }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

export function WarehousesPage() {
  return (
    <AdminModulePage title="Warehouses" subtitle="Create, deactivate, and review warehouse masters">
      <WarehousesTab />
    </AdminModulePage>
  );
}

export function MembersPage() {
  return (
    <AdminModulePage title="Members" subtitle="Manage IDM users, roles, and warehouse assignments">
      <MembersTab />
    </AdminModulePage>
  );
}

export function RolesPage() {
  return (
    <AdminModulePage title="Roles" subtitle="Configure role names and permission grants">
      <RolesTab />
    </AdminModulePage>
  );
}

export function ProductsPage() {
  return (
    <AdminModulePage title="Products" subtitle="Import, export, and review product masters">
      <ProductsTab />
    </AdminModulePage>
  );
}

export function InvoicesPage() {
  return (
    <AdminModulePage title="Invoices" subtitle="Review invoices, apply stacked filters, and export CSV data">
      <InvoicesTab />
    </AdminModulePage>
  );
}

export function InboundPage() {
  return (
    <AdminModulePage title="Inbound Stock" subtitle="Review SAP dispatch documents received by warehouses">
      <InboundTab />
    </AdminModulePage>
  );
}

export function StockPage() {
  return (
    <AdminModulePage title="Warehouse Stock" subtitle="Review every serial currently in warehouse stock">
      <StockTab />
    </AdminModulePage>
  );
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState("warehouses");

  return (
    <div>
      <PageHeader title="Masters" subtitle="Warehouse, product, and invoice management" />

      <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "var(--space-2) var(--space-4)",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted)",
              fontSize: "0.875rem"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "warehouses" && <WarehousesTab />}
      {activeTab === "members" && <MembersTab />}
      {activeTab === "roles" && <RolesTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "invoices" && <InvoicesTab />}
      {activeTab === "inbound" && <InboundTab />}
      {activeTab === "stock" && <StockTab />}
    </div>
  );
}
