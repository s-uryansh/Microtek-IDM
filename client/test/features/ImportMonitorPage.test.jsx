import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ImportMonitorPage } from "../../src/features/imports/ImportMonitorPage.jsx";

vi.mock("../../src/api/modules/importMonitor.js", () => ({
  importProduction: vi.fn().mockResolvedValue({ status: "PROCESSED", importedCount: 2, rejectedCount: 0, rejectedRows: [] }),
  listBatches: vi.fn().mockResolvedValue({ batches: [], total: 0 }),
  fetchAgeingSummary: vi.fn().mockResolvedValue({ warehouses: [], asOf: new Date().toISOString() })
}));

function clickManualTab() {
  fireEvent.click(screen.getByText("Manual Import"));
}

describe("ImportMonitorPage", () => {
  test("renders page header and import form", () => {
    render(
      <MemoryRouter>
        <ImportMonitorPage />
      </MemoryRouter>
    );
    expect(screen.getByText("SAP Import Monitor")).toBeVisible();
    expect(screen.getByText("Import History")).toBeVisible();
    expect(screen.getByText("Manual Import")).toBeVisible();
    expect(screen.getByText("Ageing Summary")).toBeVisible();
  });

  test("submits import and displays result", async () => {
    render(
      <MemoryRouter>
        <ImportMonitorPage />
      </MemoryRouter>
    );
    clickManualTab();
    fireEvent.change(screen.getByLabelText("External Reference"), { target: { value: "TEST-REF-001" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "SAP-TEST" } });
    const textarea = screen.getByPlaceholderText(/DEMO-MANUAL-A001/);
    fireEvent.change(textarea, { target: { value: "DEMO-001,SKU-INV-1,BATCH-01,3" } });
    fireEvent.click(screen.getByText("Import Production Serials"));
    await waitFor(() => {
      const badges = screen.getAllByText("PROCESSED");
      expect(badges.length).toBe(2);
    });
    expect(screen.getByText("2")).toBeVisible();
  });
});
