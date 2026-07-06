import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GRNPage } from "../../src/features/grn/GRNPage.jsx";
import { AuthContext } from "../../src/auth/AuthProvider.jsx";

const createMock = vi.fn();
const scanMock = vi.fn();
const completeMock = vi.fn();
const getGrnMock = vi.fn();

vi.mock("../../src/api/modules/grn.js", () => ({
  createGrn: (...args) => createMock(...args),
  scanGrnSerial: (...args) => scanMock(...args),
  completeGrn: (...args) => completeMock(...args),
  getGrn: (...args) => getGrnMock(...args)
}));

// Staff user: WarehouseSelector auto-fills the receiving warehouse from their assignment.
function renderPage(user = { userId: "1", role: "warehouse_operator", warehouseIds: [3] }) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <MemoryRouter>
        <GRNPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

// Dispatch-doc-first flow: enter a dispatch number, then start the session.
async function startSession(dispatchRef = "DISP-1") {
  fireEvent.change(screen.getByLabelText("Dispatch Number"), { target: { value: dispatchRef } });
  fireEvent.click(screen.getByText("Load Dispatch & Start GRN"));
}

beforeEach(() => {
  createMock.mockReset();
  scanMock.mockReset();
  completeMock.mockReset();
  getGrnMock.mockReset();
  getGrnMock.mockResolvedValue({ grnId: 1, expectedProducts: [] });
});

describe("GRNPage — happy path", () => {
  test("renders the dispatch entry form and starts a session", async () => {
    createMock.mockResolvedValue({
      grnId: 1,
      sapDispatchDocId: 1,
      dispatchRef: "DISP-1",
      receivingWarehouseId: 3,
      status: "PENDING",
      expectedProducts: [{ productId: 7, productCode: "MTK-1", productName: "Inverter 1KVA", category: "INVERTER", batchNo: "B1", expectedQty: 2, receivedQty: 0 }]
    });
    renderPage();
    expect(screen.getByText("Goods Receipt Note")).toBeVisible();
    expect(screen.getByText("Start GRN Session")).toBeVisible();
    await startSession();
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    // Expected items show product details, not serials.
    expect(screen.getByText("Inverter 1KVA")).toBeVisible();
    expect(createMock).toHaveBeenCalledWith({ warehouseId: 3, dispatchRef: "DISP-1" });
  });
});

describe("GRNPage — scan flows", () => {
  beforeEach(() => {
    createMock.mockResolvedValue({ grnId: 1, sapDispatchDocId: 1, dispatchRef: "DISP-1", receivingWarehouseId: 3, status: "PENDING", expectedProducts: [] });
  });

  test("matched scan renders a MATCHED result", async () => {
    scanMock.mockResolvedValue({ valid: true, matchStatus: "MATCHED", serial: { serialId: 1, serialNo: "S-1" }, alert: null, exception: null });
    renderPage();
    await startSession();
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("MATCHED")).toBeVisible());
    expect(screen.getByText("Serial received")).toBeVisible();
  });

  test("successful scan enables completion and closes the GRN", async () => {
    scanMock.mockResolvedValue({ valid: true, matchStatus: "MATCHED", serial: { serialId: 1, serialNo: "S-1" }, alert: null, exception: null });
    completeMock.mockResolvedValue({ grnId: 1, status: "CLOSED", summary: { scannedCount: 1 } });
    renderPage();
    await startSession();
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("MATCHED")).toBeVisible());
    fireEvent.click(screen.getByText("Complete Session"));
    fireEvent.click(screen.getByRole("button", { name: "Close Session" }));
    await waitFor(() => expect(screen.getByText("Completed")).toBeVisible());
    expect(completeMock).toHaveBeenCalledWith({ grnId: 1 });
  });

  test("rejected scan (wrong product) renders the alert rule code", async () => {
    scanMock.mockResolvedValue({
      valid: false,
      matchStatus: "WRONG_SERIAL",
      alert: { ruleCode: "WRONG_SERIAL", message: "Serial's product is not part of this dispatch document." }
    });
    renderPage();
    await startSession();
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-WRONG" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("WRONG_SERIAL")).toBeVisible());
  });

  test("scan throwing API error is rendered as REJECTED with the error message", async () => {
    scanMock.mockRejectedValue(new Error("Backend down"));
    renderPage();
    await startSession();
    await waitFor(() => expect(screen.getByText(/GRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Backend down")).toBeVisible());
  });
});

describe("GRNPage — error states", () => {
  test("start error (e.g. already received) renders inline message", async () => {
    createMock.mockRejectedValue(new Error("This dispatch document has already been received"));
    renderPage();
    await startSession();
    await waitFor(() => expect(screen.getByText("This dispatch document has already been received")).toBeVisible());
  });
});
