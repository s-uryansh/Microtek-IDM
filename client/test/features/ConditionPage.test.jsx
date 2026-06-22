import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ConditionPage } from "../../src/features/condition/ConditionPage.jsx";

const fetchHeldStockMock = vi.fn();
const correctConditionTagMock = vi.fn();

vi.mock("../../src/api/modules/condition.js", () => ({
  fetchHeldStock: (...args) => fetchHeldStockMock(...args),
  correctConditionTag: (...args) => correctConditionTagMock(...args)
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ConditionPage />
    </MemoryRouter>
  );
}

const heldItems = [
  { serialId: 7, serialNo: "MTK1234567890", productCode: "INV-900", conditionTag: "DEFECTIVE", warehouseId: 3 },
  { serialId: 8, serialNo: "MTK9999999999", productCode: "BAT-100", conditionTag: "REPAIR", warehouseId: 3 }
];

describe("ConditionPage", () => {
  beforeEach(() => {
    fetchHeldStockMock.mockReset();
    correctConditionTagMock.mockReset();
  });

  test("lists held stock and retags a serial SALEABLE", async () => {
    fetchHeldStockMock
      .mockResolvedValueOnce({ items: heldItems })
      .mockResolvedValueOnce({ items: [] });
    correctConditionTagMock.mockResolvedValue({ ok: true });

    renderPage();

    await waitFor(() => expect(screen.getByText("MTK1234567890")).toBeVisible());

    // Retag the first held serial back to SALEABLE, confirming the dialog.
    fireEvent.click(screen.getAllByText("SALEABLE")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mark Saleable" }));

    await waitFor(() =>
      expect(correctConditionTagMock).toHaveBeenCalledWith({ serialNo: "MTK1234567890", conditionTag: "SALEABLE" })
    );
    await waitFor(() => expect(screen.getByText(/No stock on condition hold/)).toBeVisible());
  });

  test("search filters the held stock list", async () => {
    fetchHeldStockMock.mockResolvedValue({ items: heldItems });
    renderPage();

    await waitFor(() => expect(screen.getByText("MTK1234567890")).toBeVisible());

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "BAT-100" } });

    expect(screen.queryByText("MTK1234567890")).not.toBeInTheDocument();
    expect(screen.getByText("MTK9999999999")).toBeVisible();
  });

  test("shows the empty state when nothing is on hold", async () => {
    fetchHeldStockMock.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/No stock on condition hold/)).toBeVisible());
  });
});
