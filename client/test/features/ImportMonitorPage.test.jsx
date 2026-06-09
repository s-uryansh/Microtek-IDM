import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ImportMonitorPage } from "../../src/features/imports/ImportMonitorPage.jsx";

vi.mock("../../src/api/modules/importMonitor.js", () => ({
  scanSapReceipt: vi.fn().mockResolvedValue({
    valid: true,
    matchStatus: "MATCHED",
    sourceWarehouseId: 1,
    expectedWarehouseId: 3,
    receivedWarehouseId: 3,
    sapDispatchDocId: 12
  }),
  fetchAgeingSummary: vi.fn().mockResolvedValue({ warehouses: [], asOf: new Date().toISOString() })
}));

describe("ImportMonitorPage", () => {
  test("renders page header and import form", () => {
    render(
      <MemoryRouter>
        <ImportMonitorPage />
      </MemoryRouter>
    );
    expect(screen.getByText("SAP Import Monitor")).toBeVisible();
    expect(screen.getByText("Receipt Scan")).toBeVisible();
    expect(screen.getByText("Ageing Summary")).toBeVisible();
    expect(screen.getByText("SAP Receipt Scan")).toBeVisible();
  });

  test("scans received stock and shows source to receiving warehouse", async () => {
    render(
      <MemoryRouter>
        <ImportMonitorPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    const input = screen.getByLabelText("Scan QR Serial");
    fireEvent.change(input, { target: { value: "MTK1234567896" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText(/Received from warehouse 1 into 3/)).toBeVisible();
    });
  });

  test("does not expose manual SAP registry import to operators", () => {
    render(
      <MemoryRouter>
        <ImportMonitorPage />
      </MemoryRouter>
    );
    expect(screen.queryByText("SAP Registry Import")).not.toBeInTheDocument();
  });

  test("does not expose SAP import history to operators", () => {
    render(
      <MemoryRouter>
        <ImportMonitorPage />
      </MemoryRouter>
    );
    expect(screen.queryByText("Import History")).not.toBeInTheDocument();
  });

  test("does not expose bulk file import or export in receipt scanning", () => {
    render(
      <MemoryRouter>
        <ImportMonitorPage />
      </MemoryRouter>
    );
    expect(screen.queryByText("Import Receipt Scans")).not.toBeInTheDocument();
    expect(screen.queryByText("Export Receipt Scans")).not.toBeInTheDocument();
  });
});
