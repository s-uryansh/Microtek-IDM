import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DispatchPage } from "../../src/features/dispatch/DispatchPage.jsx";

const createMock = vi.fn();
const scanMock = vi.fn();
const completeMock = vi.fn();
const availabilityMock = vi.fn();

vi.mock("../../src/api/modules/dispatch.js", () => ({
  createDispatch: (...args) => createMock(...args),
  fetchDispatchAvailability: (...args) => availabilityMock(...args),
  scanDispatchSerial: (...args) => scanMock(...args),
  completeDispatch: (...args) => completeMock(...args),
  getDispatch: vi.fn()
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <DispatchPage />
    </MemoryRouter>
  );
}

async function startDispatch() {
  fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Warehouse ID"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Dispatch Quantity"), { target: { value: "1" } });
  fireEvent.click(screen.getByText("Start Dispatch"));
  await waitFor(() => expect(screen.getByText(/Dispatch #1/)).toBeVisible());
}

beforeEach(() => {
  createMock.mockReset();
  scanMock.mockReset();
  completeMock.mockReset();
  availabilityMock.mockReset();
  availabilityMock.mockResolvedValue({
    invoiceId: 1,
    warehouseId: 3,
    invoiceRequiredQuantity: 4,
    alreadyScannedQuantity: 0,
    remainingInvoiceQuantity: 4,
    currentWarehouseStockQty: 9
  });
});

describe("DispatchPage — happy path", () => {
  test("creates a dispatch and shows the scan session", async () => {
    createMock.mockResolvedValue({
      dispatchId: 1,
      invoiceId: 1,
      warehouseId: 3,
      status: "PENDING",
      targetQuantity: 1,
      currentWarehouseStockQty: 9
    });
    renderPage();
    await startDispatch();
    expect(screen.getByText(/Current Stock: 9/)).toBeVisible();
    expect(createMock).toHaveBeenCalledWith({
      invoiceId: 1,
      warehouseId: 3,
      dispatchQuantity: 1
    });
  });
});

describe("DispatchPage — scan flows", () => {
  beforeEach(() => {
    createMock.mockResolvedValue({
      dispatchId: 1,
      invoiceId: 1,
      warehouseId: 3,
      status: "PENDING",
      targetQuantity: 1,
      currentWarehouseStockQty: 9
    });
  });

  test("enables physical QR scanning after dispatch setup without invoice line input", async () => {
    renderPage();
    await startDispatch();
    const input = screen.getByLabelText("Scan Serial");
    expect(input).not.toBeDisabled();
    expect(screen.queryByLabelText("Invoice Line ID")).not.toBeInTheDocument();
    expect(scanMock).not.toHaveBeenCalled();
  });

  test("valid scan renders ACCEPTED result", async () => {
    scanMock.mockResolvedValue({
      valid: true, status: "IN_PROGRESS",
      scan: { dispatchScanId: 1, serialNo: "S-1" },
      alert: null, exception: null
    });
    renderPage();
    await startDispatch();
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Serial dispatched")).toBeVisible());
  });

  test("successful scan enables completion and marks the dispatch dispatched", async () => {
    scanMock.mockResolvedValue({
      valid: true, status: "IN_PROGRESS",
      scan: { dispatchScanId: 1, serialNo: "S-1" },
      alert: null, exception: null
    });
    completeMock.mockResolvedValue({ dispatchId: 1, status: "DISPATCHED" });
    renderPage();
    await startDispatch();
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Serial dispatched")).toBeVisible());
    fireEvent.click(screen.getByText("Complete Session"));
    await waitFor(() => expect(screen.getByText("Completed")).toBeVisible());
    expect(completeMock).toHaveBeenCalledWith({ dispatchId: 1 });
  });

  test("invalid scan renders the alert rule code", async () => {
    scanMock.mockResolvedValue({
      valid: false, status: "ALREADY_DISPATCHED",
      alert: { ruleCode: "ALREADY_DISPATCHED", message: "Serial has already been dispatched." }
    });
    renderPage();
    await startDispatch();
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("ALREADY_DISPATCHED")).toBeVisible());
  });
});
