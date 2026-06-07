import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AgeingPage } from "../../src/features/ageing/AgeingPage.jsx";

const mockFetch = vi.fn();
vi.mock("../../src/api/modules/ageing.js", () => ({
  fetchAgeingReport: (...args) => mockFetch(...args)
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AgeingPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("AgeingPage", () => {
  test("renders header and shows prompt when no warehouse is entered", () => {
    renderPage();
    expect(screen.getByText("Ageing Report")).toBeVisible();
    expect(screen.getByText(/Enter a warehouse ID/)).toBeVisible();
  });

  test("loads and renders bucket data after warehouse is entered", async () => {
    mockFetch.mockResolvedValue({
      filters: { warehouseIds: [3] },
      summary: [
        { bucketCode: "B0_30", label: "0-30", quantity: 1240 },
        { bucketCode: "B31_60", label: "31-60", quantity: 683 },
        { bucketCode: "B61_90", label: "61-90", quantity: 412 },
        { bucketCode: "B91_PLUS", label: "91+", quantity: 512 }
      ],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Warehouse ID"), { target: { value: "3" } });
    await waitFor(() => {
      const labels = screen.getAllByText("0-30");
      expect(labels.length).toBe(2);
    });
  });

  test("shows empty bar chart and empty data table when buckets are zero", async () => {
    mockFetch.mockResolvedValue({
      summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 0 }],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Warehouse ID"), { target: { value: "3" } });
    await waitFor(() => {
      expect(screen.getByText("No ageing data available")).toBeVisible();
    });
  });

  test("renders warning banner when missingReceivedAtCount > 0", async () => {
    mockFetch.mockResolvedValue({
      summary: [{ bucketCode: "MISSING", label: "Missing receipt date", quantity: 5 }],
      dataQuality: { missingReceivedAtCount: 5 }
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Warehouse ID"), { target: { value: "3" } });
    await waitFor(() => {
      expect(screen.getByText(/5 in-stock serials are missing receipt dates/)).toBeVisible();
    });
  });

  test("renders error state on backend failure and supports retry", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network unreachable")).mockResolvedValueOnce({
      summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 1 }],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Warehouse ID"), { target: { value: "3" } });
    await waitFor(() => {
      expect(screen.getByText("Unable to load ageing report")).toBeVisible();
    });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(screen.getAllByText("0-30")).toHaveLength(2);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("does NOT crash on null summary", async () => {
    mockFetch.mockResolvedValue({ filters: {}, summary: null, dataQuality: { missingReceivedAtCount: 0 } });
    renderPage();
    fireEvent.change(screen.getByLabelText("Warehouse ID"), { target: { value: "3" } });
    await waitFor(() => {
      expect(screen.getByText("No ageing data available")).toBeVisible();
    });
  });
});
