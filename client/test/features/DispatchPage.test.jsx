import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DispatchPage } from "../../src/features/dispatch/DispatchPage.jsx";
import { AuthContext } from "../../src/auth/AuthProvider.jsx";

const createMock = vi.fn();
const scanMock = vi.fn();
const completeMock = vi.fn();
const availabilityMock = vi.fn();
const searchInvoicesMock = vi.fn();
const searchWarehousesMock = vi.fn();

vi.mock("../../src/api/modules/dispatch.js", () => ({
  createDispatch: (...args) => createMock(...args),
  fetchDispatchAvailability: (...args) => availabilityMock(...args),
  scanDispatchSerial: (...args) => scanMock(...args),
  completeDispatch: (...args) => completeMock(...args),
  getDispatch: vi.fn()
}));

vi.mock("../../src/api/modules/lookups.js", () => ({
  searchInvoices: (...args) => searchInvoicesMock(...args),
  searchWarehouses: (...args) => searchWarehousesMock(...args)
}));

function renderPage(user = { userId: "1", role: "warehouse_operator", warehouseIds: [3] }) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <MemoryRouter>
        <DispatchPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const mockInvoice = {
  invoiceId: 1,
  warehouseId: 3,
  sapInvoiceRef: "INV-1",
  warehouseCode: "RW-01",
  status: "PENDING",
  lines: [{ invoiceLineId: 10, lineNo: 1, productCode: "P1", productName: "Prod 1", quantity: 4 }]
};

beforeEach(() => {
  createMock.mockReset();
  scanMock.mockReset();
  completeMock.mockReset();
  availabilityMock.mockReset();
  searchInvoicesMock.mockReset();
  searchWarehousesMock.mockReset();
  searchWarehousesMock.mockResolvedValue({ items: [] });
});

describe("DispatchPage — initial render", () => {
  test("renders the page header and form elements", () => {
    renderPage();
    expect(screen.getByText("Dispatch")).toBeVisible();
    expect(screen.getByText("Start Dispatch Session")).toBeVisible();
    expect(screen.getByLabelText("Invoice ID")).toBeVisible();
    expect(screen.getByRole("button", { name: /load/i })).toBeVisible();
  });

  test("load button is disabled when input is empty", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /load/i });
    expect(btn).toBeDisabled();
  });

  test("load button becomes enabled when query is entered", () => {
    renderPage();
    const input = screen.getByLabelText("Invoice ID");
    fireEvent.change(input, { target: { value: "1" } });
    const btn = screen.getByRole("button", { name: /load/i });
    expect(btn).not.toBeDisabled();
  });

  test("searchInvoices is called after Load click", async () => {
    searchInvoicesMock.mockResolvedValue({ items: [mockInvoice] });
    availabilityMock.mockResolvedValue({
      invoiceId: 1, warehouseId: 3, invoiceRequiredQuantity: 4,
      alreadyScannedQuantity: 0, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9
    });
    renderPage();
    const input = screen.getByLabelText("Invoice ID");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() => {
      expect(searchInvoicesMock).toHaveBeenCalledWith({ query: "1" });
    });
  });
});

describe("DispatchPage — after invoice loaded", () => {
  test("shows invoice reference after loading", async () => {
    searchInvoicesMock.mockResolvedValue({ items: [mockInvoice] });
    // The dispatch warehouse now comes from the operator's assignment via the
    // WarehouseSelector, not from the invoice.
    searchWarehousesMock.mockResolvedValue({ items: [{ warehouseId: 3, code: "RW-01", name: "Region West 01" }] });
    availabilityMock.mockResolvedValue({
      invoiceId: 1, warehouseId: 3, invoiceRequiredQuantity: 4,
      alreadyScannedQuantity: 0, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9
    });
    renderPage();
    const input = screen.getByLabelText("Invoice ID");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() => expect(screen.getByText("INV-1")).toBeVisible());
    expect(screen.getByText(/Prod 1/)).toBeVisible();
    // Operator's assigned warehouse is shown by the (locked) WarehouseSelector.
    expect(screen.getByText(/RW-01/)).toBeVisible();
  });

  test("shows availability after loading", async () => {
    searchInvoicesMock.mockResolvedValue({ items: [mockInvoice] });
    availabilityMock.mockResolvedValue({
      invoiceId: 1, warehouseId: 3, invoiceRequiredQuantity: 4,
      alreadyScannedQuantity: 0, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9
    });
    renderPage();
    const input = screen.getByLabelText("Invoice ID");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() => expect(screen.getByText(/In stock:/)).toBeVisible());
  });
});

describe("DispatchPage — partial dispatch", () => {
  test("shows a partial-dispatch warning when stock is short", async () => {
    searchInvoicesMock.mockResolvedValue({ items: [mockInvoice] });
    availabilityMock.mockResolvedValue({
      invoiceId: 1, warehouseId: 3, invoiceRequiredQuantity: 4,
      alreadyScannedQuantity: 0, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 2
    });
    renderPage();
    const input = screen.getByLabelText("Invoice ID");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() => expect(screen.getByText(/Not enough stock.*PARTIAL/)).toBeVisible());
    expect(screen.getByRole("button", { name: /Start Partial Dispatch/ })).toBeVisible();
  });
});

describe("DispatchPage — scan flows", () => {
  beforeEach(() => {
    searchInvoicesMock.mockResolvedValue({ items: [mockInvoice] });
    availabilityMock.mockResolvedValue({
      invoiceId: 1, warehouseId: 3, invoiceRequiredQuantity: 4,
      alreadyScannedQuantity: 0, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9
    });
  });

  async function startDispatch() {
    const input = screen.getByLabelText("Invoice ID");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() => expect(screen.getByText(/In stock:/)).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: /Start Dispatch/ }));
    await waitFor(() => expect(screen.getByText(/Dispatch #/)).toBeVisible());
  }

  test("enables scanning after dispatch setup", async () => {
    createMock.mockResolvedValue({
      dispatchId: 1, invoiceId: 1, warehouseId: 3, status: "PENDING",
      dispatchQuantity: 4, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9, partial: false
    });
    renderPage();
    await startDispatch();
    expect(screen.getByLabelText("Scan Serial")).not.toBeDisabled();
  });

  test("valid scan renders ACCEPTED result", async () => {
    createMock.mockResolvedValue({
      dispatchId: 1, invoiceId: 1, warehouseId: 3, status: "PENDING",
      dispatchQuantity: 4, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9, partial: false
    });
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

  test("complete dispatch marks it dispatched", async () => {
    createMock.mockResolvedValue({
      dispatchId: 1, invoiceId: 1, warehouseId: 3, status: "PENDING",
      dispatchQuantity: 4, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9, partial: false
    });
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
    createMock.mockResolvedValue({
      dispatchId: 1, invoiceId: 1, warehouseId: 3, status: "PENDING",
      dispatchQuantity: 4, remainingInvoiceQuantity: 4, currentWarehouseStockQty: 9, partial: false
    });
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
