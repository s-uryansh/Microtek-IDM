import { StatusBadge } from "../ui/StatusBadge.jsx";

const stateConfig = {
  success: { className: "scan-result--success", icon: "check" },
  warning: { className: "scan-result--warning", icon: "warning" },
  error: { className: "scan-result--error", icon: "error" }
};

export function ScanResult({ serialNo, status, message, state = "success" }) {
  const config = stateConfig[state] || stateConfig.success;

  return (
    <div className={`scan-result ${config.className}`} role="status" aria-live="polite">
      <div className="scan-result__icon" aria-hidden="true">
        {state === "success" && (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 9 L8 12 L13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === "warning" && (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1 L17 16 L1 16 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 6 L9 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="9" cy="12.5" r="0.75" fill="currentColor" />
          </svg>
        )}
        {state === "error" && (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 6 L12 12 M12 6 L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="scan-result__body">
        <div className="scan-result__serial">{serialNo}</div>
        {message && <div className="scan-result__message">{message}</div>}
      </div>
      <div className="scan-result__status">
        <StatusBadge status={status || state} />
      </div>
    </div>
  );
}
