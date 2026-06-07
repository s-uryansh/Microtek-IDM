import { TrendIndicator } from "./TrendIndicator.jsx";

export function KPICard({ label, value, unit, trend, loading, className = "", ...props }) {
  if (loading) {
    return (
      <div className={`kpi-card ${className}`.trim()} {...props}>
        <div className="kpi-card__header">
          <span className="skeleton skeleton--text" style={{ width: "60%" }} />
        </div>
        <div className="kpi-card__value">
          <span className="skeleton skeleton--heading" style={{ width: "40%" }} />
        </div>
        <div className="kpi-card__footer">
          <span className="skeleton skeleton--badge" />
        </div>
      </div>
    );
  }

  const formattedValue = typeof value === "number" ? value.toLocaleString() : value;

  return (
    <div className={`kpi-card ${className}`.trim()} {...props}>
      <div className="kpi-card__header">
        <span className="kpi-card__label">{label}</span>
      </div>
      <div className="kpi-card__value">
        {formattedValue}
        {unit && <span className="kpi-card__unit">{unit}</span>}
      </div>
      <div className="kpi-card__footer">
        <TrendIndicator direction={trend?.direction} percentage={trend?.percentage} />
      </div>
    </div>
  );
}
