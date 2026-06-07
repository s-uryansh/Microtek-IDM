import { useCallback, useRef, useState } from "react";

import { normalizeScanValue } from "./useScanner.js";

function buildScan({ serialNo, status, message, state, module }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    serialNo,
    status,
    message,
    state,
    module,
    scannedAt: new Date().toISOString()
  };
}

export function useScanSession({ module, onScan, completed = false, duplicateDetection = true } = {}) {
  const scannedSerialsRef = useRef(new Set());
  const pausedRef = useRef(false);
  const [scans, setScans] = useState([]);
  const [feedbackState, setFeedbackState] = useState("idle");
  const [pending, setPending] = useState(false);
  const [paused, setPaused] = useState(false);

  const resetFeedback = useCallback((state) => {
    setFeedbackState(state);
    window.setTimeout(() => setFeedbackState("idle"), 800);
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
  }, []);

  const submitScan = useCallback(async (value) => {
    const serialNo = normalizeScanValue(value);
    if (!serialNo || pending || completed || pausedRef.current) return null;

    if (duplicateDetection && scannedSerialsRef.current.has(serialNo)) {
      const duplicateScan = buildScan({
        serialNo,
        status: "DUPLICATE_SCAN",
        message: "Duplicate scan ignored",
        state: "warning",
        module
      });
      setScans((prev) => [duplicateScan, ...prev]);
      resetFeedback("warning");
      return duplicateScan;
    }

    setPending(true);
    setFeedbackState("idle");

    try {
      const result = typeof onScan === "function" ? await onScan(serialNo) : {};
      scannedSerialsRef.current.add(serialNo);
      const newScan = buildScan({
        serialNo,
        status: result?.status || "ACCEPTED",
        message: result?.message || "",
        state: result?.state || "success",
        module
      });
      setScans((prev) => [newScan, ...prev]);
      resetFeedback(newScan.state);
      return newScan;
    } catch (err) {
      const errorScan = buildScan({
        serialNo,
        status: "REJECTED",
        message: err?.message || "Scan rejected",
        state: "error",
        module
      });
      setScans((prev) => [errorScan, ...prev]);
      resetFeedback("error");
      return errorScan;
    } finally {
      setPending(false);
    }
  }, [completed, duplicateDetection, module, onScan, pending, resetFeedback]);

  return {
    scans,
    lastScan: scans[0] ?? null,
    feedbackState,
    pending,
    paused,
    pause,
    resume,
    submitScan
  };
}
