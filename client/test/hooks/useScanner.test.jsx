import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const zxingMocks = vi.hoisted(() => ({
  decodeFromVideoElement: vi.fn(),
  reset: vi.fn()
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: function BrowserMultiFormatReader() {
    return {
      decodeFromVideoElement: zxingMocks.decodeFromVideoElement,
      reset: zxingMocks.reset
    };
  }
}));

import { normalizeScanValue, useScanner } from "../../src/hooks/useScanner.js";

function ScannerHarness({ onScan }) {
  const scanner = useScanner({ onScan });

  return (
    <div>
      <span data-testid="supported">{String(scanner.cameraSupported)}</span>
      <span data-testid="barcode">{String(scanner.nativeBarcodeSupported)}</span>
      <span data-testid="fallback">{String(scanner.fallbackScannerSupported)}</span>
      <span data-testid="status">{scanner.cameraStatus}</span>
      <span data-testid="error">{scanner.cameraError}</span>
      <video ref={scanner.videoRef} />
      <button type="button" onClick={() => scanner.submitHardwareScan("  mt-001\n")}>
        Submit
      </button>
      <button type="button" onClick={scanner.startCamera}>
        Start
      </button>
      <button type="button" onClick={scanner.stopCamera}>
        Stop
      </button>
    </div>
  );
}

describe("normalizeScanValue", () => {
  test("trims scanner suffixes and normalizes serial casing", () => {
    expect(normalizeScanValue("  mt-001\r\n")).toBe("MT-001");
  });

  test("collapses empty scanner values", () => {
    expect(normalizeScanValue(" \n\t ")).toBe("");
  });
});

describe("useScanner", () => {
  beforeEach(() => {
    zxingMocks.decodeFromVideoElement.mockReset();
    zxingMocks.reset.mockReset();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue();
  });

  test("detects camera and BarcodeDetector support", () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalBarcodeDetector = globalThis.BarcodeDetector;

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      configurable: true
    });
    globalThis.BarcodeDetector = vi.fn();

    render(<ScannerHarness onScan={() => {}} />);

    expect(screen.getByTestId("supported")).toHaveTextContent("true");
    expect(screen.getByTestId("barcode")).toHaveTextContent("true");

    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true
    });
    globalThis.BarcodeDetector = originalBarcodeDetector;
  });

  test("submits normalized hardware scanner values", async () => {
    const onScan = vi.fn();

    render(<ScannerHarness onScan={onScan} />);

    await act(async () => {
      screen.getByText("Submit").click();
    });

    expect(onScan).toHaveBeenCalledWith("MT-001");
  });

  test("uses fallback scanner when BarcodeDetector is unavailable", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalBarcodeDetector = globalThis.BarcodeDetector;
    const stream = { getTracks: () => [{ stop: vi.fn() }] };

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true
    });
    globalThis.BarcodeDetector = undefined;

    render(<ScannerHarness onScan={() => {}} />);

    await act(async () => {
      screen.getByText("Start").click();
    });

    expect(screen.getByTestId("fallback")).toHaveTextContent("true");
    expect(screen.getByTestId("status")).toHaveTextContent("scanning");

    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true
    });
    globalThis.BarcodeDetector = originalBarcodeDetector;
  });

  test("submits decoded values from the fallback scanner", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalBarcodeDetector = globalThis.BarcodeDetector;
    const onScan = vi.fn();
    const stream = { getTracks: () => [{ stop: vi.fn() }] };

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true
    });
    globalThis.BarcodeDetector = undefined;
    zxingMocks.decodeFromVideoElement.mockImplementation((_video, callback) => {
      callback({ getText: () => "qr-serial-1" });
    });

    render(<ScannerHarness onScan={onScan} />);

    await act(async () => {
      screen.getByText("Start").click();
    });

    expect(onScan).toHaveBeenCalledWith("QR-SERIAL-1");

    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true
    });
    globalThis.BarcodeDetector = originalBarcodeDetector;
  });

  test("shows permission denied errors from camera startup", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalBarcodeDetector = globalThis.BarcodeDetector;

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("Denied"), { name: "NotAllowedError" })) },
      configurable: true
    });
    globalThis.BarcodeDetector = vi.fn();

    render(<ScannerHarness onScan={() => {}} />);

    await act(async () => {
      screen.getByText("Start").click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("permission-denied");
    expect(screen.getByTestId("error")).toHaveTextContent("Camera permission denied");

    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true
    });
    globalThis.BarcodeDetector = originalBarcodeDetector;
  });

  test("reports secure context diagnostics instead of generic unsupported browser", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalSecureContext = globalThis.isSecureContext;

    Object.defineProperty(globalThis, "isSecureContext", {
      value: false,
      configurable: true
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true
    });

    render(<ScannerHarness onScan={() => {}} />);

    await act(async () => {
      screen.getByText("Start").click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("unsupported");
    expect(screen.getByTestId("error")).toHaveTextContent("Secure context required");

    Object.defineProperty(globalThis, "isSecureContext", {
      value: originalSecureContext,
      configurable: true
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true
    });
  });

  test("stops camera tracks during cleanup", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalBarcodeDetector = globalThis.BarcodeDetector;
    const stop = vi.fn();

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
      configurable: true
    });
    globalThis.BarcodeDetector = vi.fn();

    const { unmount } = render(<ScannerHarness onScan={() => {}} />);

    await act(async () => {
      screen.getByText("Start").click();
    });
    unmount();

    expect(stop).toHaveBeenCalledOnce();

    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true
    });
    globalThis.BarcodeDetector = originalBarcodeDetector;
  });
});
