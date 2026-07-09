import { useState, useEffect, useCallback } from "react";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { Collapsible } from "../../components/ui/Collapsible.jsx";
import { toCsv, downloadCsv } from "../../utils/csv.js";
import { fetchPermissions, fetchRoles, createRole, updateRole } from "../../api/modules/admin.js";
import { describePermission } from "./permissionLabels.js";
import { toArray } from "./adminShared.js";

const roleColumns = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "memberCount", label: "Members" },
  { key: "permissionCount", label: "Permissions" },
  { key: "isActive", label: "Status" }
];

export function RolesTab() {
  const [roles, setRoles] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
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
    setEditorOpen(true);
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
    setEditorOpen(true);
  }

  function handleExportCsv() {
    downloadCsv(
      "roles-export.csv",
      toCsv(roleColumns, toArray(roles?.items)
        .filter((role) => role.code !== "admin")
        .map((role) => ({
          ...role,
          permissionCount: role.permissions?.length || 0,
          isActive: role.isActive ? "Active" : "Inactive"
        })))
    );
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
    <div>
      <Card title="Role List">
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <Button variant="secondary" onClick={startNewRole}>
            + New Role
          </Button>
          <Button variant="secondary" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>
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

      <div style={{ marginTop: "var(--space-4)" }}>
        <Collapsible
          title="Role Editor"
          open={editorOpen}
          onOpenChange={setEditorOpen}
          openLabel="Show Role Editor"
          closeLabel="Hide Role Editor"
        >
        <Card title="Role Editor">
        <div className="scan-workflow-form">
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
              {permissionOptions.map((permission) => {
                const meta = describePermission(permission);
                return (
                  <label
                    key={permission}
                    title={meta.description}
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      alignItems: "flex-start",
                      fontSize: "0.875rem"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(permission)}
                      onChange={() => togglePermission(permission)}
                      style={{ marginTop: "0.2rem" }}
                    />
                    <span>
                      <span style={{ fontWeight: 500 }}>{meta.label}</span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.75rem",
                          color: "var(--color-text-secondary)"
                        }}
                      >
                        {meta.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          {formError && <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{formError}</p>}
          <Button onClick={handleSave} disabled={!form.name.trim() || (!selectedRoleId && !form.code.trim()) || saving}>
            {saving ? "Saving..." : selectedRoleId ? "Update Role" : "Create Role"}
          </Button>
        </div>
        </Card>
        </Collapsible>
      </div>
    </div>
  );
}
