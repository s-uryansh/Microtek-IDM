import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { InvoicesPage } from "../../src/features/admin/AdminPage.jsx";

const fetchAllInvoicesMock = vi.fn();
const exportInvoicesCsvMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../../src/api/modules/admin.js", () => ({
  fetchAllInvoices: (...args) => fetchAllInvoicesMock(...args),
  exportInvoicesCsv: (...args) => exportInvoicesCsvMock(...args),
  importInvoicesCsv: vi.fn(),
  fetchWarehouses: vi.fn(),
  fetchPermissions: vi.fn(),
  fetchRoles: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  fetchMembers: vi.fn(),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  createWarehouse: vi.fn(),
  deactivateWarehouse: vi.fn(),
  reactivateWarehouse: vi.fn(),
  fetchProducts: vi.fn(),
  importProductsCsv: vi.fn(),
  exportProductsCsv: vi.fn(),
  fetchInboundDispatches: vi.fn(),
  fetchWarehouseStock: vi.fn()
}));

vi.mock("../../src/auth/useAuth.js", () => ({
  useAuth: () => useAuthMock()
}));

const invoices = [
  {
    invoiceId: 1,
    sapInvoiceRef: "INV-ALPHA",
    orderId: "SO-1",
    customerName: "Alpha Traders",
    billingNumber: "BILL-1",
    status: "PENDING",
    dispatchedQty: 0,
    returnedQty: 0,
    lines: []
  },
  {
    invoiceId: 2,
    sapInvoiceRef: "INV-BETA",
    orderId: "SO-2",
    customerName: "Beta Stores",
    billingNumber: "BILL-2",
    status: "DISPATCHED",
    dispatchedQty: 4,
    returnedQty: 0,
    lines: []
  },
  {
    invoiceId: 3,
    sapInvoiceRef: "INV-ALPHA-RETURNED",
    orderId: "SO-3",
    customerName: "Alpha Traders",
    billingNumber: "BILL-3",
    status: "DISPATCHED",
    dispatchedQty: 2,
    returnedQty: 2,
    lines: []
  }
];

describe("InvoicesPage", () => {
  beforeEach(() => {
    fetchAllInvoicesMock.mockReset();
    exportInvoicesCsvMock.mockReset();
    useAuthMock.mockReturnValue({
      user: { role: "supervisor" },
      hasPermission: (permission) => ["invoice:read", "invoice:export"].includes(permission)
    });
    fetchAllInvoicesMock.mockResolvedValue({ items: invoices });
    exportInvoicesCsvMock.mockResolvedValue({ csv: "sap_invoice_ref\nINV-ALPHA" });
    URL.createObjectURL = vi.fn(() => "blob:invoice-export");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  test("applies customer and dispatch status filters together", async () => {
    render(<InvoicesPage />);

    await waitFor(() => expect(screen.getByText("INV-ALPHA")).toBeVisible());

    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "Alpha Traders" } });
    fireEvent.change(screen.getByLabelText("Dispatch Status"), { target: { value: "RETURNED" } });

    expect(screen.queryByText("INV-ALPHA")).toBeNull();
    expect(screen.queryByText("INV-BETA")).toBeNull();
    expect(screen.getByText("INV-ALPHA-RETURNED")).toBeVisible();
  });

  test("exports all invoices for users with invoice export permission", async () => {
    render(<InvoicesPage />);

    await waitFor(() => expect(screen.getByText("INV-ALPHA")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => expect(exportInvoicesCsvMock).toHaveBeenCalledTimes(1));
  });
});
