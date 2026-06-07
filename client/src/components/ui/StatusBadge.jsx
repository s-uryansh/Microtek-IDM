function normalizeStatus(status) {
  if (!status) return "pending";
  return status.toLowerCase().replace(/\s+/g, "-");
}

export function StatusBadge({ status, className = "", ...props }) {
  const normalized = normalizeStatus(status);

  return (
    <span className={`status-badge status-badge--${normalized} ${className}`.trim()} {...props}>
      {status || "Unknown"}
    </span>
  );
}
