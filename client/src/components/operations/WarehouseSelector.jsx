import { useEffect, useState } from "react";

import { useAuth } from "../../auth/useAuth.js";
import { searchWarehouses } from "../../api/modules/lookups.js";

/**
 * Warehouse picker with role-aware behaviour:
 *  - Admin / master: a dropdown of the warehouses they can access.
 *  - Everyone else (staff): the field is locked to the warehouse they are assigned
 *    to and auto-filled — staff cannot change it.
 *
 * Pass `allowStaffSelect` to let staff pick from the dropdown too (e.g. the
 * destination of a warehouse transfer, which is by definition not their own
 * warehouse). It has no effect for admins, who always get the dropdown.
 *
 * Controlled via `value` (warehouseId as string) and `onChange(id)`.
 */
export function WarehouseSelector({ value, onChange, label = "Warehouse", helperText, allowStaffSelect = false }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const assignedId = user?.defaultWarehouseId ?? user?.warehouseIds?.[0];
  const showDropdown = isAdmin || allowStaffSelect;

  const [warehouses, setWarehouses] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    // Destination pickers (allowStaffSelect) must offer every warehouse, not
    // just the ones the caller is scoped to, so request the unscoped list.
    searchWarehouses(allowStaffSelect ? { all: true } : undefined)
      .then((res) => {
        if (active) setWarehouses(Array.isArray(res?.items) ? res.items : []);
      })
      .catch((err) => {
        if (active) setError(err?.message || "Failed to load warehouses");
      });
    return () => {
      active = false;
    };
  }, [allowStaffSelect]);

  // Staff: auto-fill (once) with their assigned warehouse so they never pick one.
  // Skipped when the dropdown is shown (admin, or allowStaffSelect) so the field
  // isn't force-filled with the user's own warehouse.
  useEffect(() => {
    if (!showDropdown && !value && assignedId) {
      onChange(String(assignedId));
    }
  }, [showDropdown, value, assignedId, onChange]);

  const selected = warehouses.find((w) => String(w.warehouseId) === String(value));
  const selectedLabel = selected
    ? `${selected.code} · ${selected.name}`
    : value
      ? `Warehouse ${value}`
      : "—";

  if (showDropdown) {
    return (
      <div className="input-group">
        <label className="input-group__label">{label}</label>
        <select
          className="input"
          aria-label={label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            Select a warehouse
          </option>
          {warehouses.map((w) => (
            <option key={w.warehouseId} value={w.warehouseId}>
              {w.code} · {w.name}
            </option>
          ))}
        </select>
        {error && <p style={{ color: "var(--color-error)", fontSize: "0.8125rem" }}>{error}</p>}
        {helperText && <p className="input-group__hint">{helperText}</p>}
      </div>
    );
  }
  if(isAdmin){
    return(
      <div className="input-group">
        <label className="input-group_label">{label}</label>
        <select
          className="input"
          aria-label={label}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          >
            <option value="" disabled>
              Select Warehouse
            </option>
            {warehouses.map((w) => (
              <option key={w.warehouseId} value={w.warehouseId}>
                {w.code} . {w.name}
              </option>
            ))}
          </select>
          {
            error && <p style={{color: "var(--color-error)", fontSize: "0.8125rem"}}>{error}</p>
          }
      </div>
    )
  }

  return (
    <div className="input-group">
      <label className="input-group__label">{label}</label>
      <div
        className="input"
        aria-label={label}
        aria-readonly="true"
        style={{
          display: "flex",
          alignItems: "center",
          color: "var(--color-text-secondary)",
          backgroundColor: "var(--color-surface-subtle)"
        }}
      >
        {selectedLabel}
      </div>
      <p className="input-group__hint">Assigned to your account.</p>
    </div>
  );
}
