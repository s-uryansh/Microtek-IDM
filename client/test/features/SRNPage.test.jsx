import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SRNPage } from "../../src/features/srn/SRNPage.jsx";

const createMock = vi.fn();
const scanMock = vi.fn();

vi.mock("../../src/api/modules/srn.js", () => ({
  createSrn: (...args) => createMock(...args),
  scanSrnSerial: (...args) => scanMock(...args),
  getSrn: vi.fn()
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SRNPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  createMock.mockReset();
  scanMock.mockReset();
});

describe("SRNPage — happy path", () => {
  test("creates an SRN and shows the scan session", async () => {
    createMock.mockResolvedValue({ srnId: 1, receivingWarehouseId: 3, status: "PENDING" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
  });
});

describe("SRNPage — scan flows", () => {
  beforeEach(() => {
    createMock.mockResolvedValue({ srnId: 1, receivingWarehouseId: 3, status: "PENDING" });
  });

  test("valid scan renders the condition tag in the result message", async () => {
    scanMock.mockResolvedValue({ valid: true, srnScanId: 1, conditionTag: "SALEABLE" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText(/Return accepted \(SALEABLE\)/)).toBeVisible());
  });

  test("sends the selected condition tag with scanned returns", async () => {
    scanMock.mockResolvedValue({ valid: true, srnScanId: 1, conditionTag: "DEFECTIVE" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Condition Tag"), { target: { value: "DEFECTIVE" } });
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
    const input = screen.getByLabelText("Scan Serial");
    fireEvent.change(input, { target: { value: "S-1" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText(/Return accepted \(DEFECTIVE\)/)).toBeVisible());
    expect(scanMock).toHaveBeenCalledWith({
      srnId: 1,
      serialNo: "S-1",
      conditionTag: "DEFECTIVE"
    });
  });

  test("invalid scan renders ALREADY_RETURNED rule code", async () => {
    scanMock.mockResolvedValue({
      valid: false,
      alert: { ruleCode: "ALREADY_RETURNED", message: "Serial has already been returned." }
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText(/SRN #1/)).toBeVisible());
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
    fireEvent.change(screen.getByLabelText("Receiving Warehouse ID"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Start SRN"));
    await waitFor(() => expect(screen.getByText("Forbidden")).toBeVisible());
  });
});
