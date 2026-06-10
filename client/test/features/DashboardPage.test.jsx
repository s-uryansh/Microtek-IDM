import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage.jsx";

const ageingMock = vi.fn();
const exceptionsMock = vi.fn();

vi.mock("../../src/api/modules/ageing.js", () => ({
  fetchAgeingReport: (...args) => ageingMock(...args)
}));
vi.mock("../../src/api/modules/exceptions.js", () => ({
  fetchExceptions: (...args) => exceptionsMock(...args)
}));
// Dashboard widgets are gated by permission; default to an admin (all permitted).
let dashboardPermissions = new Set();
vi.mock("../../src/auth/useAuth.js", () => ({
  useAuth: () => ({
    user: { userId: "1", role: "admin" },
    hasPermission: (permission) => dashboardPermissions.has(permission)
  })
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  ageingMock.mockReset();
  exceptionsMock.mockReset();
  dashboardPermissions = new Set(["ageing:read", "exception:read"]);
});

describe("DashboardPage — successful load", () => {
  test("renders KPI labels and ageing buckets", async () => {
    ageingMock.mockResolvedValue({
      summary: [
        { bucketCode: "B0_30", label: "0-30", quantity: 100 },
        { bucketCode: "B31_60", label: "31-60", quantity: 50 }
      ],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    exceptionsMock.mockResolvedValue({ exceptions: [], total: 7 });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Total Inventory")).toBeVisible();
    });
    expect(screen.getByText("Open Exceptions")).toBeVisible();
    expect(screen.getByText("0-30")).toBeVisible();
    expect(screen.getByText("31-60")).toBeVisible();
  });

  test("isolates the ageing chart viewport from the card header", async () => {
    ageingMock.mockResolvedValue({
      summary: [
        { bucketCode: "B0_30", label: "0-30", quantity: 100 },
        { bucketCode: "B31_60", label: "31-60", quantity: 50 }
      ],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    exceptionsMock.mockResolvedValue({ exceptions: [], total: 0 });

    renderDashboard();

    const title = await screen.findByText("Inventory Ageing Distribution");
    const card = title.closest(".card");
    expect(card).not.toBeNull();
    expect(within(card).getByTestId("card-header")).toContainElement(title);
    expect(within(card).getByTestId("card-body")).toContainElement(screen.getByTestId("bar-chart-viewport"));
  });
});

describe("DashboardPage — empty load", () => {
  test("renders bar chart empty state when ageing has no positive buckets", async () => {
    ageingMock.mockResolvedValue({
      summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 0 }],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    exceptionsMock.mockResolvedValue({ exceptions: [], total: 0 });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Total Inventory")).toBeVisible();
    });
    expect(screen.getByText("No ageing data available")).toBeVisible();
  });

  test("renders activity empty state when exceptions list is empty", async () => {
    ageingMock.mockResolvedValue({
      summary: [],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    exceptionsMock.mockResolvedValue({ exceptions: [], total: 0 });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("No recent activity.")).toBeVisible();
    });
  });
});

describe("DashboardPage — failed load (the original blocker)", () => {
  test("does NOT crash when both ageing and exceptions fail", async () => {
    ageingMock.mockRejectedValue(new Error("Network down"));
    exceptionsMock.mockRejectedValue(new Error("Network down"));

    expect(() => renderDashboard()).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText("Unable to load dashboard metrics")).toBeVisible();
    });
    const metricsAlert = screen
      .getByText("Unable to load dashboard metrics")
      .closest("[role='alert']");
    expect(within(metricsAlert).getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("shows partial data when one endpoint fails and the other succeeds", async () => {
    ageingMock.mockResolvedValue({
      summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 25 }],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    exceptionsMock.mockRejectedValue(new Error("auth"));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Total Inventory")).toBeVisible();
    });
    expect(screen.getByText("Some metrics are unavailable. Showing partial data.")).toBeVisible();
  });

  test("shows chart error state when ageing fails but exceptions succeeds", async () => {
    ageingMock.mockRejectedValue(new Error("503"));
    exceptionsMock.mockResolvedValue({ exceptions: [], total: 0 });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Unable to load ageing data")).toBeVisible();
    });
  });

  test("does NOT show 'null' anywhere when load fails", async () => {
    ageingMock.mockRejectedValue(new Error("boom"));
    exceptionsMock.mockRejectedValue(new Error("boom"));
    renderDashboard();
    await waitFor(() => {
      expect(screen.queryByText("null")).toBeNull();
    });
  });
});

describe("DashboardPage — retry", () => {
  test("clicking retry on the KPI error re-fetches both endpoints", async () => {
    ageingMock.mockRejectedValueOnce(new Error("first")).mockResolvedValueOnce({
      summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 10 }],
      dataQuality: { missingReceivedAtCount: 0 }
    });
    exceptionsMock.mockRejectedValueOnce(new Error("first")).mockResolvedValueOnce({
      exceptions: [], total: 0
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Unable to load dashboard metrics")).toBeVisible();
    });

    const metricsAlert = screen
      .getByText("Unable to load dashboard metrics")
      .closest("[role='alert']");
    fireEvent.click(within(metricsAlert).getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("Total Inventory")).toBeVisible();
    });
    expect(ageingMock).toHaveBeenCalledTimes(2);
    expect(
      exceptionsMock.mock.calls.filter(([params]) => (
        params?.status === "OPEN" && params?.pageSize === 1
      ))
    ).toHaveLength(2);
  });
});

describe("DashboardPage — permission gating", () => {
  test("hides ageing widgets and skips the ageing fetch without ageing:read", async () => {
    dashboardPermissions = new Set(["exception:read"]);
    ageingMock.mockResolvedValue({ summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 5 }] });
    exceptionsMock.mockResolvedValue({ exceptions: [], total: 3 });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Open Exceptions")).toBeVisible();
    });
    expect(screen.queryByText("Inventory Ageing Distribution")).toBeNull();
    expect(screen.queryByText("Total Inventory")).toBeNull();
    expect(ageingMock).not.toHaveBeenCalled();
  });

  test("hides exception widgets without exception:read", async () => {
    dashboardPermissions = new Set(["ageing:read"]);
    ageingMock.mockResolvedValue({ summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 5 }] });
    exceptionsMock.mockResolvedValue({ exceptions: [], total: 3 });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Inventory Ageing Distribution")).toBeVisible();
    });
    expect(screen.queryByText("Open Exceptions")).toBeNull();
    expect(exceptionsMock).not.toHaveBeenCalled();
  });
});
