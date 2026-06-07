import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const DEFAULT_FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "upc_a", "upc_e"];
const CAMERA_REPEAT_DELAY_MS = 900;

export function normalizeScanValue(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+$/g, "")
    .trim()
    .toUpperCase();
}

function canUseCamera() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
}

function canUseBarcodeDetector() {
  return typeof globalThis.BarcodeDetector === "function";
}

export function useScanner({ onScan, formats = DEFAULT_FORMATS } = {}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const detectorRef = useRef(null);
  const fallbackControlsRef = useRef(null);
  const pausedRef = useRef(false);
  const lastCameraScanRef = useRef({ value: "", at: 0 });
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [cameraError, setCameraError] = useState("");
  const [supportedFormats, setSupportedFormats] = useState([]);
  const cameraSupported = canUseCamera();
  const nativeBarcodeSupported = canUseBarcodeDetector();
  const fallbackScannerSupported = typeof BrowserMultiFormatReader === "function";

  const requestedFormats = useMemo(() => formats, [formats]);

  const stopCamera = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    fallbackControlsRef.current?.stop?.();
    fallbackControlsRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    pausedRef.current = false;
    setCameraStatus("idle");
  }, []);

  const submitHardwareScan = useCallback(async (value) => {
    const serialNo = normalizeScanValue(value);
    if (!serialNo || typeof onScan !== "function") return null;
    return onScan(serialNo);
  }, [onScan]);

  const detectFrame = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current || pausedRef.current) {
      if (streamRef.current) {
        frameRef.current = requestAnimationFrame(detectFrame);
      }
      return;
    }

    try {
      const results = await detectorRef.current.detect(videoRef.current);
      const firstValue = normalizeScanValue(results?.[0]?.rawValue);
      const now = Date.now();
      const recentlyScanned =
        firstValue === lastCameraScanRef.current.value &&
        now - lastCameraScanRef.current.at < CAMERA_REPEAT_DELAY_MS;

      if (firstValue && !recentlyScanned) {
        lastCameraScanRef.current = { value: firstValue, at: now };
        await submitHardwareScan(firstValue);
      }
    } catch (err) {
      setCameraError(err?.message || "Camera scan failed");
      setCameraStatus("error");
    }

    if (streamRef.current) {
      frameRef.current = requestAnimationFrame(detectFrame);
    }
  }, [submitHardwareScan]);

  const startFallbackScanner = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play?.();
    }

    const reader = new BrowserMultiFormatReader();
    const controls = await reader.decodeFromVideoElement(videoRef.current, async (result) => {
      if (!result || pausedRef.current) return;
      const text = typeof result.getText === "function" ? result.getText() : result.text;
      const serialNo = normalizeScanValue(text);
      const now = Date.now();
      const recentlyScanned =
        serialNo === lastCameraScanRef.current.value &&
        now - lastCameraScanRef.current.at < CAMERA_REPEAT_DELAY_MS;

      if (serialNo && !recentlyScanned) {
        lastCameraScanRef.current = { value: serialNo, at: now };
        await submitHardwareScan(serialNo);
      }
    });
    fallbackControlsRef.current = controls;
  }, [submitHardwareScan]);

  const startCamera = useCallback(async () => {
    setCameraError("");

    if (!cameraSupported || (!nativeBarcodeSupported && !fallbackScannerSupported)) {
      setCameraStatus("unsupported");
      return;
    }

    try {
      setCameraStatus("starting");
      if (nativeBarcodeSupported) {
        const formatsToUse = supportedFormats.length > 0
          ? requestedFormats.filter((format) => supportedFormats.includes(format))
          : requestedFormats;
        detectorRef.current = new globalThis.BarcodeDetector({ formats: formatsToUse });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play?.();
        }
        frameRef.current = requestAnimationFrame(detectFrame);
      } else {
        await startFallbackScanner();
      }
      pausedRef.current = false;
      setCameraStatus("scanning");
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        setCameraError("Camera permission denied");
        setCameraStatus("permission-denied");
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setCameraError("No camera was found on this device");
        setCameraStatus("unavailable");
      } else {
        setCameraError(err?.message || "Camera unavailable");
        setCameraStatus("error");
      }
    }
  }, [cameraSupported, detectFrame, fallbackScannerSupported, nativeBarcodeSupported, requestedFormats, startFallbackScanner, supportedFormats]);

  const pauseCamera = useCallback(() => {
    pausedRef.current = true;
    setCameraStatus("paused");
  }, []);

  const resumeCamera = useCallback(() => {
    if (!streamRef.current) return;
    pausedRef.current = false;
    setCameraStatus("scanning");
  }, []);

  useEffect(() => {
    let active = true;

    async function loadFormats() {
      if (!nativeBarcodeSupported || typeof globalThis.BarcodeDetector.getSupportedFormats !== "function") {
        return;
      }

      try {
        const availableFormats = await globalThis.BarcodeDetector.getSupportedFormats();
        if (active) {
          setSupportedFormats(availableFormats);
        }
      } catch {
        if (active) {
          setSupportedFormats([]);
        }
      }
    }

    loadFormats();
    return () => {
      active = false;
      stopCamera();
    };
  }, [nativeBarcodeSupported, stopCamera]);

  return {
    videoRef,
    cameraSupported,
    nativeBarcodeSupported,
    fallbackScannerSupported,
    supportedFormats,
    cameraStatus,
    cameraError,
    startCamera,
    pauseCamera,
    resumeCamera,
    stopCamera,
    submitHardwareScan
  };
}
