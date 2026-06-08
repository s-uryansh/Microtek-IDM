import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ScanCamera } from "../../src/components/scan/ScanCamera.jsx";

function buildScanner(overrides = {}) {
  return {
    videoRef: { current: null },
    supportedFormats: [],
    cameraStatus: "idle",
    cameraError: "",
    cameraSupported: true,
    nativeBarcodeSupported: true,
    fallbackScannerSupported: true,
    startCamera: vi.fn(),
    pauseCamera: vi.fn(),
    resumeCamera: vi.fn(),
    stopCamera: vi.fn(),
    ...overrides
  };
}

describe("ScanCamera", () => {
  test("renders camera controls and supported scan formats", () => {
    const scanner = buildScanner();

    render(<ScanCamera scanner={scanner} />);

    expect(screen.getByLabelText("Camera scanner")).toBeVisible();
    expect(screen.getByText("Start Camera")).toBeVisible();
    expect(screen.getByText("QR / Code128 / Code39 / EAN13 / UPC-A")).toBeVisible();
  });

  test("shows unsupported browser status", () => {
    const scanner = buildScanner({ cameraStatus: "unsupported" });

    render(<ScanCamera scanner={scanner} />);

    expect(screen.getAllByText("Unsupported browser capability. Use hardware scanner or manual entry.")).toHaveLength(2);
    expect(screen.getByLabelText("Camera diagnostics")).toBeVisible();
  });

  test("shows permission denied state", () => {
    const scanner = buildScanner({ cameraStatus: "permission-denied", cameraError: "Camera permission denied" });

    render(<ScanCamera scanner={scanner} />);

    expect(screen.getAllByText("Camera permission denied")).toHaveLength(2);
    expect(screen.getByText("Retry Camera")).toBeVisible();
  });
});
