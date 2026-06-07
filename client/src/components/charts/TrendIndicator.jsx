export function TrendIndicator({ direction, percentage, className = "" }) {
  if (!direction || percentage == null) return null;

  const isUp = direction === "up";
  const isDown = direction === "down";

  const trendClass = isUp
    ? "trend-indicator--up"
    : isDown
      ? "trend-indicator--down"
      : "trend-indicator--flat";

  return (
    <span className={`trend-indicator ${trendClass} ${className}`.trim()} aria-label={`${direction} ${Math.abs(percentage)}%`}>
      <svg className="trend-indicator__arrow" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        {isUp && <path d="M5 1 L9 7 L1 7 Z" fill="currentColor" />}
        {isDown && <path d="M5 9 L9 3 L1 3 Z" fill="currentColor" />}
        {!isUp && !isDown && <rect x="1" y="3.5" width="8" height="3" rx="1" fill="currentColor" />}
      </svg>
      <span className="trend-indicator__value">{Math.abs(percentage)}%</span>
    </span>
  );
}
