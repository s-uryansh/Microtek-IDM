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

function search(value) {
  const input = screen.getByLabelText("Scan Serial");
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  mockFetchHistory.mockReset();
});

describe("SerialHistoryPage", () => {
  test("renders search form", () => {
    renderPage();
    expect(screen.getByText("Serial History")).toBeVisible();
    expect(screen.getByLabelText("Scan Serial")).toBeVisible();
  });

  test("renders timeline when serial is found", async () => {
    mockFetchHistory.mockResolvedValue({
      found: true,
      serial: { serialId: 1, serialNo: "MTK-LIFECYCLE-0001", currentStatus: "IN_STOCK" },
      timeline: [
        { type: "EVENT", at: "2026-01-01T00:00:00Z", eventType: "PRODUCTION", warehouseId: 1, referenceType: null, referenceId: null, createdBy: "sys" },
        { type: "EXCEPTION", at: "2026-03-15T00:00:00Z", ruleCode: "WRONG_WAREHOUSE", contextType: "GRN", contextId: 1, status: "CORRECTED", raisedBy: "op1", correctedAt: "2026-03-16T00:00:00Z", correctedBy: "supervisor_1" }
      ]
    });
    renderPage();
    search("MTK-LIFECYCLE-0001");
    await waitFor(() => {
      expect(screen.getByText("Serial: MTK-LIFECYCLE-0001")).toBeVisible();
    });
    expect(screen.getByText("PRODUCTION")).toBeVisible();
    expect(screen.getByText("WRONG_WAREHOUSE")).toBeVisible();
  });

  test("renders 'not found' state when found: false", async () => {
    mockFetchHistory.mockResolvedValue({ found: false, serial: null, timeline: [] });
    renderPage();
    search("MISSING");
    await waitFor(() => {
      expect(screen.getByText("Not Found")).toBeVisible();
    });
    expect(screen.getByText(/was not found/)).toBeVisible();
  });

  test("renders 'not found' state when backend returns 404", async () => {
    mockFetchHistory.mockRejectedValue(new ApiError(404, { error: { code: "NOT_FOUND", message: "Serial not found" } }));
    renderPage();
    search("MISSING");
    await waitFor(() => {
      expect(screen.getByText("Not Found")).toBeVisible();
    });
    expect(screen.getByText(/was not found/)).toBeVisible();
  });

  test("does NOT crash when found but timeline missing", async () => {
    mockFetchHistory.mockResolvedValue({ found: true, serial: { serialId: 1, serialNo: "S-1" }, timeline: null });
    renderPage();
    search("S-1");
    await waitFor(() => {
      expect(screen.getByText(/No history events recorded/)).toBeVisible();
    });
  });

  test("renders error when backend returns 500", async () => {
    mockFetchHistory.mockRejectedValue(new Error("Request failed with status 500"));
    renderPage();
    search("S-1");
    await waitFor(() => {
      expect(screen.getByText("Request failed with status 500")).toBeVisible();
    });
  });

  test("does not search for empty input", () => {
    renderPage();
    search("");
    expect(mockFetchHistory).not.toHaveBeenCalled();
  });

  test("ignores leading/trailing whitespace-only input", () => {
    renderPage();
    search("   ");
    expect(mockFetchHistory).not.toHaveBeenCalled();
  });
});
