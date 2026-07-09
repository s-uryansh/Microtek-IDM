import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { Collapsible } from "../../components/ui/Collapsible.jsx";
import { toCsv, downloadCsv } from "../../utils/csv.js";
import {
  fetchWarehouses,
  fetchRoles,
  fetchMembers,
  createMember,
  updateMember,
  deactivateMember,
  reactivateMember
} from "../../api/modules/admin.js";
import { toArray } from "./adminShared.js";

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

export function MembersTab() {
  const [members, setMembers] = useState(null);
  const [roles, setRoles] = useState(null);
  const [warehouses, setWarehouses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
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
    setEditorOpen(true);
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
    setEditorOpen(true);
  }

  function handleExportCsv() {
    downloadCsv(
      "members-export.csv",
      toCsv(memberColumns, toArray(members?.items).map((member) => ({
        ...member,
        defaultWarehouseLabel: warehouseLabel(
          warehouseOptions.find((wh) => Number(wh.warehouseId) === Number(member.defaultWarehouseId || member.warehouseIds?.[0]))
        ),
        warehouseSummary: member.warehouseIds?.length
          ? member.warehouseIds
              .map((id) => warehouseLabel(warehouseOptions.find((wh) => Number(wh.warehouseId) === Number(id))))
              .join(", ")
          : "—",
        isActive: member.isActive ? "Active" : "No longer in company"
      })))
    );
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

  // Soft delete / restore. Uses the dedicated endpoints so only is_active is
  // flipped — the member's role and warehouse assignments are left untouched.
  async function toggleActive(member) {
    if (
      member.isActive &&
      !window.confirm(
        `Mark ${member.displayName || member.username} as no longer with the company? ` +
          "They will be unable to log in, but their history is kept. You can restore them later."
      )
    ) {
      return;
    }

    try {
      if (member.isActive) {
        await deactivateMember(member.userId);
      } else {
        await reactivateMember(member.userId);
      }
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
      <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>No longer in company</span>
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
    <div>
      <Card title="Member List">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-end", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <Input label="Search Members" value={query} onChange={setQuery} placeholder="Search username or display name" />
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="secondary" onClick={startNewMember}>
              + New Member
            </Button>
            <Button variant="secondary" onClick={handleExportCsv}>
              Export CSV
            </Button>
          </div>
        </div>
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

      <div style={{ marginTop: "var(--space-4)" }}>
        <Collapsible
          title="Member Editor"
          open={editorOpen}
          onOpenChange={setEditorOpen}
          openLabel="Show Member Editor"
          closeLabel="Hide Member Editor"
        >
        <Card title="Member Editor">
        <div className="scan-workflow-form">
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
        </Collapsible>
      </div>
    </div>
  );
}
