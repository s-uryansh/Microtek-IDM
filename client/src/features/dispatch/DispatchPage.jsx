import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { CustomerDispatchPanel } from "./CustomerDispatchPanel.jsx";
import { WarehouseTransferPanel } from "./WarehouseTransferPanel.jsx";

const DISPATCH_MODES = [
  { key: "customer", label: "Customer Dispatch" },
  { key: "transfer", label: "Warehouse Transfer" }
];

export function DispatchPage() {
  const [mode, setMode] = useState("customer");
  const [sessionActive, setSessionActive] = useState(false);

  return (
    <div>
      <PageHeader title="Dispatch" subtitle="Scan and dispatch orders" />

      {/* Once a session is underway, the other mode is hidden — switching mid-session
          would be confusing for the worker and doesn't correspond to anything useful. */}
      {!sessionActive && (
        <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
          {DISPATCH_MODES.map((item) => (
            <button
              key={item.key}
              onClick={() => setMode(item.key)}
              style={{
                padding: "var(--space-2) var(--space-4)",
                border: "none",
                borderBottom: mode === item.key ? "2px solid var(--color-primary)" : "2px solid transparent",
                backgroundColor: "transparent",
                cursor: "pointer",
                fontWeight: mode === item.key ? 600 : 400,
                color: mode === item.key ? "var(--color-primary)" : "var(--color-text-muted)",
                fontSize: "0.875rem"
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {mode === "customer" ? (
        <CustomerDispatchPanel onSessionActiveChange={setSessionActive} />
      ) : (
        <WarehouseTransferPanel onSessionActiveChange={setSessionActive} />
      )}
    </div>
  );
}
