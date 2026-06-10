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
  fetchAllInvoices
} from "../../api/modules/admin.js";

const PRODUCT_IMPORT_TEMPLATE = [
  "product_code,name,segment,category,is_battery,is_active",
  "MTK-0001,Demo Inverter,GENERAL,INVERTER,false,true",
  "MTK-0002,Demo Battery,BATTERY,BATTERY,true,true"
].join("\n");

const TABS = [
  { key: "warehouses", label: "Warehouses" },
  { key: "members", label: "Members" },
  { key: "roles", label: "Roles" },
  { key: "products", label: "Products" },
  { key: "invoices", label: "Invoices" }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function serialList(value) {
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : "—";
}

/* ================================================================
   WAREHOUSES TAB
   ================================================================ */

const warehouseColumns = [
  { key: "warehouseId", label: "ID" },
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
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

  const rows = toArray(warehouses?.items).map((wh) => ({
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

/* ================================================================
   PRODUCTS TAB
   ================================================================ */

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

/* ================================================================
   MEMBERS TAB
   ================================================================ */

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

/* ================================================================
   ROLES TAB
   ================================================================ */

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

/* ================================================================
   INVOICES TAB
   ================================================================ */

const invoiceColumns = [
  { key: "invoiceId", label: "ID" },
  { key: "sapInvoiceRef", label: "Reference" },
  { key: "warehouseCode", label: "Warehouse" },
  { key: "_productSummary", label: "Products", sortable: false },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" }
];

function InvoicesTab() {
  const [invoices, setInvoices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAllInvoices()
      .then((data) => setInvoices(data ?? { items: [] }))
      .catch((err) => setError(err?.message || "Failed to load invoices"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = toArray(invoices?.items).map((inv) => ({
    invoiceId: inv.invoiceId,
    sapInvoiceRef: inv.sapInvoiceRef,
    warehouseCode: inv.warehouseCode || `WH-${inv.warehouseId}`,
    status: <StatusBadge status={inv.status} />,
    createdAt: new Date(inv.createdAt).toLocaleDateString(),
    _productSummary: (
      <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {inv.lines?.length || 0} line{(inv.lines?.length || 0) !== 1 ? "s" : ""}
      </span>
    ),
    _lines: inv.lines || []
  }));

  const displayColumns = [...invoiceColumns];

  return (
    <div>
      <Card title="All Invoices">
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

      {expanded && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Card title={`Invoice #${expanded} — Line Items`}>
            {rows
              .filter((r) => r.invoiceId === expanded)
              .map((inv) => (
                <div key={inv.invoiceId}>
                  <table className="data-table__table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Line</th>
                        <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Product</th>
                        <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Category</th>
                        <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Segment</th>
                        <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial Numbers</th>
                        <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv._lines.length === 0 && (
                        <tr className="data-table__row">
                          <td colSpan={6} style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--color-text-muted)" }}>
                            No line items
                          </td>
                        </tr>
                      )}
                      {inv._lines.map((line) => (
                        <tr key={line.invoiceLineId} className="data-table__row">
                          <td style={{ padding: "var(--space-2)" }}>{line.lineNo}</td>
                          <td style={{ padding: "var(--space-2)" }}>
                            <span style={{ fontWeight: 600 }}>{line.productCode}</span>
                            <span style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem", display: "block" }}>
                              {line.productName}
                            </span>
                          </td>
                          <td style={{ padding: "var(--space-2)" }}>
                            <span className="badge">{line.category || line.segment || "—"}</span>
                          </td>
                          <td style={{ padding: "var(--space-2)" }}>{line.segment}</td>
                          <td style={{ padding: "var(--space-2)" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                              {serialList(line.serialNos)}
                            </span>
                          </td>
                          <td style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                            {line.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </Card>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   ADMIN PAGE
   ================================================================ */

export function AdminPage() {
  const [activeTab, setActiveTab] = useState("warehouses");

  return (
    <div>
      <PageHeader title="Admin Panel" subtitle="Warehouse, product, and invoice management" />

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
    </div>
  );
}
