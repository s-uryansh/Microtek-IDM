import { KPICard } from "../../components/charts/KPICard.jsx";

const KPI_CONFIG = [
  { id: "in-stock",          label: "In Stock",               key: "inStock",              unit: "serials"  },
  { id: "open-exceptions",   label: "Open Exceptions",        key: "openExceptions",       unit: "issues"   },
  { id: "resolved-exc",      label: "Exceptions Resolved",    key: "resolvedExceptions",   unit: "total"    },
  { id: "in-transit",        label: "In Transit",             key: "inTransit",            unit: "serials"  },
  { id: "grns-inprog",       label: "GRNs In Progress",       key: "grnsInProgress",       unit: "sessions" },
  { id: "dispatches-inprog", label: "Dispatches In Progress", key: "dispatchesInProgress", unit: "sessions" },
];

export function KPIRow({ kpis, loading, onInStockClick }) {
  return (
    <div className="kpi-row" aria-live="polite">
      {KPI_CONFIG.map((cfg) => {
        const clickable = cfg.id === "in-stock" && typeof onInStockClick === "function";
        return (
          <KPICard
            key={cfg.id}
            label={cfg.label}
            value={loading ? null : (kpis?.[cfg.key] ?? 0)}
            unit={cfg.unit}
            trend={null}
            loading={loading}
            onClick={clickable ? onInStockClick : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            style={clickable ? { cursor: "pointer" } : undefined}
          />
        );
      })}
    </div>
  );
}
