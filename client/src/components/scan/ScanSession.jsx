import { useCallback, useState } from "react";

import { useScanner } from "../../hooks/useScanner.js";
import { useScanSession } from "../../hooks/useScanSession.js";
import { ScanCamera } from "./ScanCamera.jsx";
import { ScanHistory } from "./ScanHistory.jsx";
import { ScanScanner } from "./ScanScanner.jsx";

export function ScanSession({
  module,
  onScan,
  onComplete,
  completed = false,
  scanCount = 0,
  title = "Scan Session",
  placeholder = "Scan or enter serial number",
  className = ""
}) {
  const [inputValue, setInputValue] = useState("");
  const scanSession = useScanSession({ module, onScan, completed });
  const scanner = useScanner({ onScan: scanSession.submitScan });
  const effectiveScanCount = Math.max(scanCount, scanSession.scans.length);
  const disabled = scanSession.pending || completed || scanSession.paused;

  const handleSubmit = useCallback(async (serialNo) => {
    const result = await scanner.submitHardwareScan(serialNo);
    if (result) {
      setInputValue("");
    }
  }, [scanner]);

  return (
    <div className={`scan-session ${className}`.trim()}>
      <div className="scan-session__header">
        <div>
          <h3 className="scan-session__title">{title}</h3>
          <p className="scan-session__subtitle">
            {effectiveScanCount} scanned · {scanSession.paused ? "Paused" : "Ready"}
          </p>
        </div>
        <div className="scan-session__header-actions">
          {!completed && (
            scanSession.paused ? (
              <button className="button button--secondary scan-session__pause" type="button" onClick={scanSession.resume}>
                Resume
              </button>
            ) : (
              <button className="button button--secondary scan-session__pause" type="button" onClick={scanSession.pause}>
                Pause
              </button>
            )
          )}
          {completed && (
            <span className="status-badge status-badge--completed">Completed</span>
          )}
        </div>
      </div>

      <ScanCamera scanner={scanner} disabled={disabled} />

      <ScanScanner
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        disabled={disabled}
        placeholder={placeholder}
        feedbackState={scanSession.feedbackState}
      />

      {onComplete && !completed && (
        <div className="scan-session__actions">
          <button
            className="button button--primary"
            onClick={onComplete}
            disabled={effectiveScanCount === 0}
            type="button"
          >
            Complete Session
          </button>
        </div>
      )}

      <ScanHistory scans={scanSession.scans} />
    </div>
  );
}
