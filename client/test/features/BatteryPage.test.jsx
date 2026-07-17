import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatteryPage } from "../../src/features/battery/BatteryPage.jsx";

const commitMock = vi.fn();
const statusMock = vi.fn();
const searchInvoicesMock = vi.fn();

vi.mock("../../src/api/modules/battery.js", () => ({
  commitBatterySerial: (...args) => commitMock(...args),
  fetchBatteryCommitStatus: (...args) => statusMock(...args)
}));

vi.mock("../../src/api/modules/lookups.js", () => ({
  searchInvoices: (...args) => searchInvoicesMock(...args)
}));

const batteryInvoice = {
  invoiceId: 2,
  sapInvoiceRef: "MTK-INVOICE-BATTERY-001",
  status: "PENDING",
  lines: [
    { invoiceLineId: 5, lineNo: 1, productId: 50, productCode: "MTK-BATTERY-100AH", productName: "Microtek Battery 100AH", quantity: 2, isBattery: true }
  ]
};

function renderPage() {
  return render(
    <MemoryRouter>
      <BatteryPage />
    </MemoryRouter>
  );
}

async function loadInvoice() {
  searchInvoicesMock.mockResolvedValue({ items: [batteryInvoice] });
  statusMock.mockResolvedValue({ invoiceId: 2, committedQuantity: 0 });
  fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
  await waitFor(() => expect(screen.getByText(/MTK-INVOICE-BATTERY-001/)).toBeVisible());
  // Product-first commit: pick the battery product before serials can be scanned.
  fireEvent.click(screen.getByRole("button", { name: /Microtek Battery 100AH/ }));
}

beforeEach(() => {
  commitMock.mockReset();
  statusMock.mockReset();
  searchInvoicesMock.mockReset();
});

describe("BatteryPage", () => {
  test("loads a battery invoice then commits a scanned serial", async () => {
    renderPage();
    await loadInvoice();

    // Product name now appears in both the invoice items panel and the product picker.
    expect(screen.getAllByText(/Microtek Battery 100AH/)[0]).toBeVisible();

    commitMock.mockResolvedValue({ valid: true, status: "COMMITTED" });
    fireEvent.change(screen.getByLabelText("Scan Serial"), { target: { value: "EB100-0001" } });
    fireEvent.keyDown(screen.getByLabelText("Scan Serial"), { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Battery serial committed")).toBeVisible());
    expect(commitMock).toHaveBeenCalledWith({ invoiceId: 2, serialNo: "EB100-0001", productId: 50 });
  });

  test("surfaces a commit rejection from the API", async () => {
    renderPage();
    await loadInvoice();

    commitMock.mockResolvedValue({
      valid: false,
      alert: { ruleCode: "NOT_BATTERY_LINE", message: "This serial's product is not a battery item on the selected invoice." }
    });
    fireEvent.change(screen.getByLabelText("Scan Serial"), { target: { value: "MTK-SOL300-0001" } });
    fireEvent.keyDown(screen.getByLabelText("Scan Serial"), { key: "Enter" });

    await waitFor(() =>
      expect(screen.getByText("This serial's product is not a battery item on the selected invoice.")).toBeVisible()
    );
  });

  test("shows an error when no battery invoice matches", async () => {
    searchInvoicesMock.mockResolvedValue({ items: [] });
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(screen.getByText(/No battery invoice found/)).toBeVisible());
  });
});
