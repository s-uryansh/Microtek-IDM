import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ExceptionsPage } from "../../src/features/exceptions/ExceptionsPage.jsx";

const listMock = vi.fn();
const detailMock = vi.fn();
const correctMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../../src/api/modules/exceptions.js", () => ({
  fetchExceptions: (...args) => listMock(...args),
  fetchException: (...args) => detailMock(...args),
  correctException: (...args) => correctMock(...args)
}));

vi.mock("../../src/auth/useAuth.js", () => ({
  useAuth: () => useAuthMock()
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ExceptionsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  listMock.mockReset();
  detailMock.mockReset();
  correctMock.mockReset();
  useAuthMock.mockReturnValue({
    user: {
      userId: "supervisor_1",
      role: "supervisor",
      warehouseIds: [5],
      defaultWarehouseId: 5
    }
  });
});

describe("ExceptionsPage — list", () => {
  test("renders the review portal without any create-exception affordance", async () => {
    listMock.mockResolvedValue({ exceptions: [], total: 0 });

    renderPage();

    await waitFor(() => expect(screen.getByText("Exception List")).toBeVisible());
    expect(screen.getByLabelText("Filter by status")).toBeVisible();
    expect(screen.queryByText("Create Exception From Serial")).toBeNull();
    expect(screen.queryByLabelText("Exception action")).toBeNull();
    expect(screen.queryByRole("button", { name: "Validate Serial" })).toBeNull();
  });

  test("renders rows and pagination summary", async () => {
    listMock.mockResolvedValue({
      exceptions: [
        { exceptionId: 1, serialNo: "MTK-001", ruleCode: "WRONG_WAREHOUSE", contextType: "GRN", status: "OPEN", raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1" },
        { exceptionId: 2, serialNo: "MTK-002", ruleCode: "NOT_FOUND", contextType: "DISPATCH", status: "CORRECTED", raisedAt: "2026-06-05T10:00:00Z", raisedBy: "op2" }
      ],
      total: 50
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("MTK-001")).toBeVisible());
    expect(screen.getByText("Showing 2 of 50 total")).toBeVisible();
  });

  test("renders empty state when backend returns no exceptions", async () => {
    listMock.mockResolvedValue({ exceptions: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No data")).toBeVisible();
    });
  });

  test("renders error state and survives a 500 response", async () => {
    listMock.mockRejectedValue(new Error("Request failed with status 500"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Request failed with status 500");
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});

describe("ExceptionsPage — detail", () => {
  beforeEach(() => {
    listMock.mockResolvedValue({
      exceptions: [{ exceptionId: 42, serialNo: "MTK-042", ruleCode: "WRONG_WAREHOUSE", contextType: "GRN", status: "OPEN", raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1" }],
      total: 1
    });
  });

  test("clicking a row opens the detail panel", async () => {
    detailMock.mockResolvedValue({
      exceptionId: 42, serialNo: "MTK-042", ruleCode: "WRONG_WAREHOUSE",
      contextType: "GRN", contextId: 1, status: "OPEN",
      raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1"
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("MTK-042")).toBeVisible());
    fireEvent.click(screen.getByText("MTK-042"));
    await waitFor(() => expect(screen.getByText("Exception #42")).toBeVisible());
    const detailPanel = screen.getByText("Exception #42").closest(".card");
    expect(within(detailPanel).getByText(/Rule:/).parentElement).toHaveTextContent("WRONG_WAREHOUSE");
  });

  test("pressing Enter on a row opens the detail panel", async () => {
    detailMock.mockResolvedValue({
      exceptionId: 42, serialNo: "MTK-042", ruleCode: "WRONG_WAREHOUSE",
      contextType: "GRN", contextId: 1, status: "OPEN",
      raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1"
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("MTK-042")).toBeVisible());
    fireEvent.keyDown(screen.getByLabelText("Open row 1"), { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Exception #42")).toBeVisible());
  });

  test("shows detail error when fetch fails", async () => {
    detailMock.mockRejectedValue(new Error("Forbidden"));
    renderPage();
    await waitFor(() => expect(screen.getByText("MTK-042")).toBeVisible());
    fireEvent.click(screen.getByText("MTK-042"));
    await waitFor(() => expect(screen.getByText("Forbidden")).toBeVisible());
  });
});

describe("ExceptionsPage — correction", () => {
  beforeEach(() => {
    listMock.mockResolvedValue({
      exceptions: [{ exceptionId: 7, serialNo: "MTK-007", ruleCode: "NOT_FOUND", contextType: "DISPATCH", status: "OPEN", raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1" }],
      total: 1
    });
  });

  test("submits correction with a reason and shows updated state", async () => {
    detailMock.mockResolvedValueOnce({
      exceptionId: 7, serialNo: "MTK-007", ruleCode: "NOT_FOUND",
      contextType: "DISPATCH", contextId: 2, status: "OPEN",
      raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1"
    });
    correctMock.mockResolvedValueOnce({
      exceptionId: 7, status: "CORRECTED",
      correctedAt: "2026-06-06T10:00:00Z", correctedBy: "supervisor_1",
      correctionReason: "verified"
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("MTK-007")).toBeVisible());
    fireEvent.click(screen.getByText("MTK-007"));
    await waitFor(() => expect(screen.getByText("Exception #7")).toBeVisible());
    fireEvent.change(screen.getByLabelText("Correction Reason (required)"), { target: { value: "verified" } });
    fireEvent.click(screen.getByRole("button", { name: "Correct Exception" }));
    fireEvent.click(screen.getByRole("button", { name: "Correct" }));
    await waitFor(() => expect(screen.getByText("CORRECTED")).toBeVisible());
    expect(correctMock).toHaveBeenCalledWith({ exceptionId: 7, correctionReason: "verified" });
  });

  test("does not submit when reason is empty", async () => {
    detailMock.mockResolvedValueOnce({
      exceptionId: 7, serialNo: "MTK-007", ruleCode: "NOT_FOUND",
      contextType: "DISPATCH", contextId: 2, status: "OPEN",
      raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1"
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("MTK-007")).toBeVisible());
    fireEvent.click(screen.getByText("MTK-007"));
    await waitFor(() => expect(screen.getByText("Exception #7")).toBeVisible());
    expect(screen.getByRole("button", { name: "Correct Exception" })).toBeDisabled();
    expect(correctMock).not.toHaveBeenCalled();
  });

  test("shows 409 conflict message when server returns CONFLICT", async () => {
    detailMock.mockResolvedValueOnce({
      exceptionId: 7, serialNo: "MTK-007", ruleCode: "NOT_FOUND",
      contextType: "DISPATCH", contextId: 2, status: "OPEN",
      raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1"
    });
    correctMock.mockRejectedValueOnce(new Error("Exception was already corrected by another user"));
    renderPage();
    await waitFor(() => expect(screen.getByText("MTK-007")).toBeVisible());
    fireEvent.click(screen.getByText("MTK-007"));
    await waitFor(() => expect(screen.getByText("Exception #7")).toBeVisible());
    fireEvent.change(screen.getByLabelText("Correction Reason (required)"), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: "Correct Exception" }));
    fireEvent.click(screen.getByRole("button", { name: "Correct" }));
    await waitFor(() => expect(screen.getByText("Exception was already corrected by another user")).toBeVisible());
  });
});

describe("ExceptionsPage — read-only role", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: {
        userId: "operator_1",
        role: "warehouse_operator",
        warehouseIds: [5],
        defaultWarehouseId: 5
      }
    });
    listMock.mockResolvedValue({
      exceptions: [{ exceptionId: 7, serialNo: "MTK-007", ruleCode: "NOT_FOUND", contextType: "DISPATCH", status: "OPEN", raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1" }],
      total: 1
    });
  });

  test("lets a warehouse operator review but not correct exceptions", async () => {
    detailMock.mockResolvedValueOnce({
      exceptionId: 7, serialNo: "MTK-007", ruleCode: "NOT_FOUND",
      contextType: "DISPATCH", contextId: 2, status: "OPEN",
      raisedAt: "2026-06-06T09:00:00Z", raisedBy: "op1"
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("MTK-007")).toBeVisible());
    fireEvent.click(screen.getByText("MTK-007"));
    await waitFor(() => expect(screen.getByText("Exception #7")).toBeVisible());

    // Read-only: no correction form, and no create affordance anywhere.
    expect(screen.queryByLabelText("Correction Reason (required)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Correct Exception" })).toBeNull();
    expect(screen.queryByText("Create Exception From Serial")).toBeNull();
  });
});
