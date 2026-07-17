import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SRNPage } from "../../src/features/srn/SRNPage.jsx";
import { AuthContext } from "../../src/auth/AuthProvider.jsx";

const createMock = vi.fn();
const scanMock = vi.fn();
const searchInvoicesMock = vi.fn();

vi.mock("../../src/api/modules/srn.js", () => ({
  createSrn: (...args) => createMock(...args),
  scanSrnSerial: (...args) => scanMock(...args),
  getSrn: vi.fn()
}));

vi.mock("../../src/api/modules/lookups.js", () => ({
  searchInvoices: (...args) => searchInvoicesMock(...args),
  // WarehouseSelector loads the warehouse list; staff get an auto-filled,
  // locked field, so a minimal stub is enough.
  searchWarehouses: () => Promise.resolve({ items: [{ warehouseId: 3, code: "RW-01", name: "Region West 01" }] })
}));

function renderPage(user = { userId: "1", role: "warehouse_operator", warehouseIds: [3] }) {
  return render(
    <AuthContext.Provider value={{ user }}>
      <MemoryRouter>
        <SRNPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

const mockInvoice = {
  invoiceId: 10,
  sapInvoiceRef: "INV-001",
  warehouseId: 3,
  warehouseCode: "RW-01",
  status: "DISPATCHED",
  lines: [
    { invoiceLineId: 1, lineNo: 1, productId: 100, productCode: "BAT-001", productName: "Battery 100Ah", quantity: 5 },
    { invoiceLineId: 2, lineNo: 2, productId: 101, productCode: "INV-002", productName: "Inverter 2kW", quantity: 3 }
  ]
};

beforeEach(() => {
  createMock.mockReset();
  scanMock.mockReset();
  searchInvoicesMock.mockReset();
});

async function loadInvoice() {
  const input = screen.getByLabelText("Invoice ID");
  fireEvent.change(input, { target: { value: "10" } });
  searchInvoicesMock.mockResolvedValue({ items: [mockInvoice] });
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  await waitFor(() => expect(screen.getByText(/INV-001/)).toBeVisible());
}

function selectFirstProduct() {
  const checkboxes = screen.getAllByRole("checkbox");
  fireEvent.click(checkboxes[0]);
}

describe("SRNPage — happy path", () => {
  test("creates an SRN and shows the scan session", async () => {
    createMock.mockResolvedValue({ srnId: 1, receivingWarehouseId: 3, invoiceId: 10, status: "PENDING" });
    renderPage();
    await loadInvoice();
    selectFirstProduct();
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
    // Product-first return: pick the product before serials can be scanned.
    fireEvent.click(screen.getByRole("button", { name: /Battery 100Ah/ }));
    expect(createMock).toHaveBeenCalledWith({ warehouseId: 3, invoiceId: 10, returnProductIds: [100], expectedQuantity: null });
  });
});

describe("SRNPage — scan flows", () => {
  beforeEach(async () => {
    createMock.mockResolvedValue({ srnId: 1, receivingWarehouseId: 3, invoiceId: 10, status: "PENDING" });
  });

  test("valid scan renders the condition tag in the result message", async () => {
    scanMock.mockResolvedValue({ valid: true, srnScanId: 1, conditionTag: "SALEABLE" });
    renderPage();
    await loadInvoice();
    selectFirstProduct();
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
    // Product-first return: pick the product before serials can be scanned.
    fireEvent.click(screen.getByRole("button", { name: /Battery 100Ah/ }));
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText(/Return accepted \(SALEABLE\)/)).toBeVisible());
  });

  test("sends the selected condition tag with scanned returns", async () => {
    scanMock.mockResolvedValue({ valid: true, srnScanId: 1, conditionTag: "DEFECTIVE" });
    renderPage();
    await loadInvoice();
    fireEvent.change(screen.getByLabelText("Condition Tag"), { target: { value: "DEFECTIVE" } });
    selectFirstProduct();
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
    // Product-first return: pick the product before serials can be scanned.
    fireEvent.click(screen.getByRole("button", { name: /Battery 100Ah/ }));
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText(/Return accepted \(DEFECTIVE\)/)).toBeVisible());
    expect(scanMock).toHaveBeenCalledWith({
      srnId: 1,
      serialNo: "S-1",
      conditionTag: "DEFECTIVE",
      productId: 100
    });
  });

  test("invalid scan renders ALREADY_RETURNED rule code", async () => {
    scanMock.mockResolvedValue({
      valid: false,
      alert: { ruleCode: "ALREADY_RETURNED", message: "Serial has already been returned." }
    });
    renderPage();
    await loadInvoice();
    selectFirstProduct();
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
    // Product-first return: pick the product before serials can be scanned.
    fireEvent.click(screen.getByRole("button", { name: /Battery 100Ah/ }));
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("ALREADY_RETURNED")).toBeVisible());
  });
});

describe("SRNPage — error states", () => {
  test("create error renders inline message", async () => {
    createMock.mockRejectedValue(new Error("Forbidden"));
    renderPage();
    await loadInvoice();
    selectFirstProduct();
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText("Forbidden")).toBeVisible());
  });

  test("load invoice not found shows error", async () => {
    renderPage();
    const input = screen.getByLabelText("Invoice ID");
    fireEvent.change(input, { target: { value: "999" } });
    searchInvoicesMock.mockResolvedValue({ items: [] });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(screen.getByText("Invoice not found")).toBeVisible());
  });

  test("displays invoice line items after loading", async () => {
    renderPage();
    await loadInvoice();
    expect(screen.getByText("Battery 100Ah")).toBeVisible();
    expect(screen.getByText("BAT-001")).toBeVisible();
    expect(screen.getByText("Inverter 2kW")).toBeVisible();
    expect(screen.getByText("INV-002")).toBeVisible();
  });
});
