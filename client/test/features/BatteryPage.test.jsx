import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatteryPage } from "../../src/features/battery/BatteryPage.jsx";

const commitMock = vi.fn();
const statusMock = vi.fn();

vi.mock("../../src/api/modules/battery.js", () => ({
  commitBatterySerial: (...args) => commitMock(...args),
  fetchBatteryCommitStatus: (...args) => statusMock(...args)
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BatteryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  commitMock.mockReset();
  statusMock.mockReset();
});

describe("BatteryPage — happy path", () => {
  test("commits a battery serial through the shared scan session", async () => {
    commitMock.mockResolvedValue({ valid: true, status: "COMMITTED", serial: { serialId: 1, serialNo: "BAT-001" } });
    renderPage();
    expect(screen.getByText("Battery Pre-Billing")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Invoice Line ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Scan Serial"), { target: { value: "BAT-001" } });
    fireEvent.keyDown(screen.getByLabelText("Scan Serial"), { key: "Enter" });
    await waitFor(() => expect(screen.getByText("COMMITTED")).toBeVisible());
    expect(screen.getByText("Battery serial committed")).toBeVisible();
  });

  test("fetches commit status and renders the count", async () => {
    statusMock.mockResolvedValue({ invoiceId: 1, committedQuantity: 3 });
    renderPage();
    fireEvent.change(screen.getAllByLabelText("Invoice ID")[0], { target: { value: "1" } });
    fireEvent.click(screen.getByText("Check Status"));
    await waitFor(() => expect(screen.getByText("serials committed")).toBeVisible());
    expect(screen.getByText("3")).toBeVisible();
  });
});

describe("BatteryPage — error states", () => {
  test("commit failure shows alert message from API", async () => {
    commitMock.mockResolvedValue({
      valid: false,
      alert: { ruleCode: "ALREADY_COMMITTED", message: "Serial is already committed to another invoice." }
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice Line ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Scan Serial"), { target: { value: "BAT-001" } });
    fireEvent.keyDown(screen.getByLabelText("Scan Serial"), { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Serial is already committed to another invoice.")).toBeVisible());
  });

  test("commit network failure is recorded in scan history", async () => {
    commitMock.mockRejectedValue(new Error("Network unreachable"));
    renderPage();
    fireEvent.change(screen.getByLabelText("Invoice Line ID"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Scan Serial"), { target: { value: "BAT-001" } });
    fireEvent.keyDown(screen.getByLabelText("Scan Serial"), { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Network unreachable")).toBeVisible());
  });

  test("status fetch failure shows thrown error", async () => {
    statusMock.mockRejectedValue(new Error("Request failed with status 404"));
    renderPage();
    fireEvent.change(screen.getAllByLabelText("Invoice ID")[0], { target: { value: "1" } });
    fireEvent.click(screen.getByText("Check Status"));
    await waitFor(() => expect(screen.getByText("Request failed with status 404")).toBeVisible());
  });

  test("handles missing committedQuantity gracefully (renders 0)", async () => {
    statusMock.mockResolvedValue({ invoiceId: 1 });
    renderPage();
    fireEvent.change(screen.getAllByLabelText("Invoice ID")[0], { target: { value: "1" } });
    fireEvent.click(screen.getByText("Check Status"));
    await waitFor(() => expect(screen.getByText("0")).toBeVisible());
  });
});
