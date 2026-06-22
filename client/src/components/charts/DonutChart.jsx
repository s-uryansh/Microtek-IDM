import { EmptyState } from "../ui/EmptyState.jsx";
import { Skeleton } from "../ui/Skeleton.jsx";

const COLORS = [
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-error)",
];

export function DonutChart({ data, loading, emptyMessage = "No data available" }) {
  if (loading) {
    return (
      <div className="donut-chart">
        <Skeleton width={140} height={140} style={{ borderRadius: "50%" }} />
        <div className="donut-chart__legend">
          {[100, 80, 110, 70].map((w, i) => (
            <Skeleton key={i} width={w} height={14} />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title={emptyMessage} description="" />;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyState title={emptyMessage} description="" />;

  const R = 54;
  const CX = 70;
  const CY = 70;
  const STROKE = 22;
  const circumference = 2 * Math.PI * R;

  let offset = 0;
  const segments = data.map((d, i) => {
    const fraction = d.value / total;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const seg = { ...d, color: COLORS[i % COLORS.length], dash, gap, offset };
    offset += dash;
    return seg;
  });

  return (
    <div className="donut-chart">
      <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--color-bg-elevated)" strokeWidth={STROKE} />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset + circumference / 4}
          />
        ))}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--color-text-primary)">{total.toLocaleString()}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">serials</text>
      </svg>
      <div className="donut-chart__legend">
        {segments.map((seg, i) => (
          <div key={i} className="donut-chart__legend-item">
            <span className="donut-chart__swatch" style={{ background: seg.color }} />
            <span>{seg.label}</span>
            <span className="donut-chart__legend-count">{seg.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
