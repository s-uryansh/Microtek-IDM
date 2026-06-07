import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../../src/api/errors.js";
import { SerialHistoryPage } from "../../src/features/serials/SerialHistoryPage.jsx";

const mockFetchHistory = vi.fn();
vi.mock("../../src/api/modules/history.js", () => ({
  fetchSerialHistory: (...args) => mockFetchHistory(...args)
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SerialHistoryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetchHistory.mockReset();
});

describe("SerialHistoryPage", () => {
  test("renders search form", () => {
    renderPage();
    expect(screen.getByText("Serial History")).toBeVisible();
    expect(screen.getByLabelText("Serial Number")).toBeVisible();
  });

  test("renders timeline when serial is found", async () => {
    mockFetchHistory.mockResolvedValue({
      found: true,
      serial: { serialId: 1, serialNo: "DEMO-HERO-0001", currentStatus: "IN_STOCK" },
      timeline: [
        { type: "EVENT", at: "2026-01-01T00:00:00Z", eventType: "PRODUCTION", warehouseId: 1, referenceType: null, referenceId: null, createdBy: "sys" },
        { type: "EXCEPTION", at: "2026-03-15T00:00:00Z", ruleCode: "WRONG_WAREHOUSE", contextType: "GRN", contextId: 1, status: "CORRECTED", raisedBy: "op1", correctedAt: "2026-03-16T00:00:00Z", correctedBy: "supervisor_1" }
      ]
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "DEMO-HERO-0001" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("Serial: DEMO-HERO-0001")).toBeVisible();
    });
    expect(screen.getByText("PRODUCTION")).toBeVisible();
    expect(screen.getByText("WRONG_WAREHOUSE")).toBeVisible();
  });

  test("renders 'not found' state when found: false", async () => {
    mockFetchHistory.mockResolvedValue({ found: false, serial: null, timeline: [] });
    renderPage();
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "MISSING" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("Not Found")).toBeVisible();
    });
    expect(screen.getByText(/MISSING/)).toBeVisible();
  });

  test("renders 'not found' state when backend returns 404", async () => {
    mockFetchHistory.mockRejectedValue(new ApiError(404, { error: { code: "NOT_FOUND", message: "Serial not found" } }));
    renderPage();
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "MISSING" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("Not Found")).toBeVisible();
    });
    expect(screen.getByText(/MISSING/)).toBeVisible();
  });

  test("does NOT crash when found but timeline missing", async () => {
    mockFetchHistory.mockResolvedValue({ found: true, serial: { serialId: 1, serialNo: "S-1" }, timeline: null });
    renderPage();
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "S-1" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText(/No history events recorded/)).toBeVisible();
    });
  });

  test("renders error when backend returns 500", async () => {
    mockFetchHistory.mockRejectedValue(new Error("Request failed with status 500"));
    renderPage();
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "S-1" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("Request failed with status 500")).toBeVisible();
    });
  });

  test("disables search button for empty input", () => {
    renderPage();
    expect(screen.getByText("Search")).toBeDisabled();
  });

  test("ignores leading/trailing whitespace on submit", async () => {
    mockFetchHistory.mockResolvedValue({ found: false, serial: null, timeline: [] });
    renderPage();
    fireEvent.change(screen.getByLabelText("Serial Number"), { target: { value: "   " } });
    expect(screen.getByText("Search")).toBeDisabled();
  });
});
