import { EmptyState } from "../ui/EmptyState.jsx";
import { Skeleton } from "../ui/Skeleton.jsx";

export function HorizontalBarChart({ data, loading, emptyMessage = "No data available", color = "var(--color-accent)" }) {
  if (loading) {
    return (
      <div className="hbar">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="hbar__row">
            <Skeleton width={80} height={12} />
            <Skeleton height={10} style={{ flex: 1 }} />
            <Skeleton width={32} height={12} />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={emptyMessage} description="" />;
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="hbar" role="list">
      {data.map((item) => {
        const pct = Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0);
        return (
          <div key={item.label} className="hbar__row" role="listitem">
            <span className="hbar__label" title={item.label}>{item.label}</span>
            <div className="hbar__track">
              <div className="hbar__fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="hbar__value">{item.value.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}
