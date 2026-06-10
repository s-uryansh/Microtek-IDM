import { useState, useRef } from "react";

import { EmptyState } from "../ui/EmptyState.jsx";

export function BarChart({ data, loading, emptyMessage = "No data available", className = "", onBarClick }) {
  if (loading) {
    return (
      <div className={`bar-chart ${className}`.trim()} role="figure" aria-label="Bar chart">
        <div className="bar-chart__skeleton">
          {[48, 92, 136, 72].map((height, i) => (
            <div key={i} className="bar-chart__skeleton-bar">
              <div className="skeleton skeleton--card" style={{ height: `${height}px` }} />
              <div className="skeleton skeleton--text" style={{ width: "60%", marginTop: "8px" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`bar-chart ${className}`.trim()} role="figure" aria-label="Bar chart">
        <EmptyState title={emptyMessage} description="" />
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={`bar-chart ${className}`.trim()} role="figure" aria-label="Bar chart">
      <div className="bar-chart__viewport" data-testid="bar-chart-viewport">
        <div className="bar-chart__plot" data-testid="bar-chart-plot">
        {data.map((bar, index) => {
          const heightPercent = Math.min(Math.max((bar.value / maxValue) * 100, 2), 100);
          return (
            <Bar
              key={bar.label}
              label={bar.label}
              value={bar.value}
              heightPercent={heightPercent}
              index={index}
              onClick={onBarClick ? () => onBarClick(bar) : undefined}
            />
          );
        })}
        </div>
        <div className="bar-chart__labels" data-testid="bar-chart-labels">
          {data.map((bar) => (
            <span key={bar.label} className="bar-chart__label">{bar.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, heightPercent, index, onClick }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const barRef = useRef(null);

  const colors = [
    "var(--color-accent)",
    "var(--color-info)",
    "var(--color-success)",
    "var(--color-warning)"
  ];
  const color = colors[index % colors.length];

  return (
    <div className="bar-chart__bar-wrapper">
        <div
          ref={barRef}
          className={`bar-chart__bar${onClick ? " bar-chart__bar--clickable" : ""}`}
          style={{
            "--bar-height": `${heightPercent}%`,
            backgroundColor: color,
            cursor: onClick ? "pointer" : undefined
          }}
          onClick={onClick}
          onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          onFocus={() => setTooltipVisible(true)}
          onBlur={() => setTooltipVisible(false)}
          tabIndex={onClick ? 0 : 0}
          role="img"
          aria-label={`${label}: ${value.toLocaleString("en-US")}${onClick ? ". Click for details" : ""}`}
        />
        {tooltipVisible && (
          <div className="bar-chart__tooltip" role="tooltip">
            <span className="bar-chart__tooltip-label">{label}</span>
            <span className="bar-chart__tooltip-value">{value.toLocaleString("en-US")}</span>
          </div>
        )}
    </div>
  );
}
