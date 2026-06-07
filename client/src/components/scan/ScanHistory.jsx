import { ScanResult } from "./ScanResult.jsx";

export function ScanHistory({ scans = [], className = "" }) {
  if (scans.length === 0) {
    return (
      <div className={`scan-history scan-history--empty ${className}`.trim()} role="status">
        <p className="scan-history__empty-text">No scans yet. Start scanning above.</p>
      </div>
    );
  }

  return (
    <div className={`scan-history ${className}`.trim()}>
      <div className="scan-history__header">
        <span className="scan-history__count">
          {scans.length} {scans.length === 1 ? "scan" : "scans"}
        </span>
      </div>
      <div className="scan-history__list" role="log" aria-label="Scan history">
        {scans.map((scan, index) => (
          <ScanResult
            key={scan.id ?? index}
            serialNo={scan.serialNo}
            status={scan.status}
            message={scan.message}
            state={scan.state || "success"}
            module={scan.module}
          />
        ))}
      </div>
    </div>
  );
}
