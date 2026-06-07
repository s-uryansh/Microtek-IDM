import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { FulfilmentPage } from "../../src/features/fulfilment/FulfilmentPage.jsx";

const mockFetchStatus = vi.fn();
vi.mock("../../src/api/modules/fulfilment.js", () => ({
  fetchFulfilmentStatus: (...args) => mockFetchStatus(...args)
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <FulfilmentPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetchStatus.mockReset();
});

describe("FulfilmentPage", () => {
  test("renders search form initially", () => {
    renderPage();
    expect(screen.getByText("Fulfilment Status")).toBeVisible();
    expect(screen.getByLabelText("Invoice ID")).toBeVisible();
    expect(screen.getByText("Search")).toBeVisible();
  });

  test("displays status on success", async () => {
    mockFetchStatus.mockResolvedValue({
      invoiceId: 1, status: "DISPATCHED",
      requiredQuantity: 5, scannedQuantity: 5, committedQuantity: 0
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("Invoice #1")).toBeVisible();
    });
    expect(screen.getByText("DISPATCHED")).toBeVisible();
    expect(screen.getByText("Required")).toBeVisible();
  });

  test("displays 0 when requiredQuantity/scannedQuantity are missing in response", async () => {
    mockFetchStatus.mockResolvedValue({ invoiceId: 2, status: "PENDING" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("Invoice #2")).toBeVisible();
    });
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(3);
  });

  test("renders error message on 404", async () => {
    mockFetchStatus.mockRejectedValue(new Error("Request failed with status 404"));
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "999" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("Request failed with status 404")).toBeVisible();
    });
  });

  test("renders 'No fulfilment data' when backend returns null", async () => {
    mockFetchStatus.mockResolvedValue(null);
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => {
      expect(screen.getByText("No fulfilment data found for this invoice.")).toBeVisible();
    });
  });

  test("does NOT crash when result has no committedQuantity", async () => {
    mockFetchStatus.mockResolvedValue({ invoiceId: 3, status: "IN_PROGRESS", requiredQuantity: 10, scannedQuantity: 4 });
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => expect(screen.getByText("Invoice #3")).toBeVisible());
    expect(screen.getByText("10")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();
  });
});
