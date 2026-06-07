import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GRNPage } from "../../src/features/grn/GRNPage.jsx";

const createMock = vi.fn();
const scanMock = vi.fn();
const completeMock = vi.fn();

vi.mock("../../src/api/modules/grn.js", () => ({
  createGrn: (...args) => createMock(...args),
  scanGrnSerial: (...args) => scanMock(...args),
  completeGrn: (...args) => completeMock(...args),
  getGrn: vi.fn()
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <GRNPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  createMock.mockReset();
  scanMock.mockReset();
  completeMock.mockReset();
});

describe("GRNPage — happy path", () => {
  test("renders create form and creates a session", async () => {
    createMock.mockResolvedValue({ grnId: 1, sapDispatchDocId: 1, receivingWarehouseId: 3, status: "PENDING" });
    renderPage();
    expect(screen.getByText("Goods Receipt Note")).toBeVisible();
    expect(screen.getByText("Start GRN Session")).toBeVisible();
    fireEvent.change(screen.getByLabelText("SAP Dispatch Document ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start GRN"));
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    expect(createMock).toHaveBeenCalledWith({ sapDispatchDocId: 1, warehouseId: 3 });
  });
});

describe("GRNPage — scan flows", () => {
  beforeEach(() => {
    createMock.mockResolvedValue({ grnId: 1, sapDispatchDocId: 1, receivingWarehouseId: 3, status: "PENDING" });
  });

  test("matched scan renders a MATCHED result", async () => {
    scanMock.mockResolvedValue({ valid: true, matchStatus: "MATCHED", serial: { serialId: 1, serialNo: "S-1" }, alert: null, exception: null });
    renderPage();
    fireEvent.change(screen.getByLabelText("SAP Dispatch Document ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start GRN"));
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("MATCHED")).toBeVisible());
    expect(screen.getByText("Serial matched")).toBeVisible();
  });

  test("successful scan enables completion and closes the GRN", async () => {
    scanMock.mockResolvedValue({ valid: true, matchStatus: "MATCHED", serial: { serialId: 1, serialNo: "S-1" }, alert: null, exception: null });
    completeMock.mockResolvedValue({ grnId: 1, status: "CLOSED", summary: { scannedCount: 1 } });
    renderPage();
    fireEvent.change(screen.getByLabelText("SAP Dispatch Document ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start GRN"));
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("MATCHED")).toBeVisible());
    fireEvent.click(screen.getByText("Complete Session"));
    await waitFor(() => expect(screen.getByText("Completed")).toBeVisible());
    expect(completeMock).toHaveBeenCalledWith({ grnId: 1 });
  });

  test("rejected scan renders the alert rule code", async () => {
    scanMock.mockResolvedValue({
      valid: false,
      matchStatus: "WRONG_SERIAL",
      alert: { ruleCode: "WRONG_SERIAL", message: "Serial belongs to another sender dispatch document." }
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("SAP Dispatch Document ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start GRN"));
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-WRONG" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("WRONG_SERIAL")).toBeVisible());
  });

  test("scan throwing API error is rendered as REJECTED with the error message", async () => {
    scanMock.mockRejectedValue(new Error("Backend down"));
    renderPage();
    fireEvent.change(screen.getByLabelText("SAP Dispatch Document ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start GRN"));
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Backend down")).toBeVisible());
  });
});

describe("GRNPage — error states", () => {
  test("create error renders inline message", async () => {
    createMock.mockRejectedValue(new Error("Network down"));
    renderPage();
    fireEvent.change(screen.getByLabelText("SAP Dispatch Document ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start GRN"));
    await waitFor(() => expect(screen.getByText("Network down")).toBeVisible());
  });
});
