import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "../../src/features/dashboard/DashboardPage.jsx";

const summaryMock = vi.fn();

vi.mock("../../src/api/modules/dashboard.js", () => ({
  fetchDashboardSummary: (...args) => summaryMock(...args)
}));

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

function buildSummary(overrides = {}) {
  return {
    kpis: {
      inStock: 100,
      openExceptions: 7,
      resolvedExceptions: 3,
      inTransit: 12,
      grnsInProgress: 2,
      dispatchesInProgress: 1
    },
    statusBreakdown: [
      { status: "IN_STOCK", count: 100 },
      { status: "IN_TRANSIT", count: 12 }
    ],
    ageingDistribution: [
      { label: "0-30", value: 80 },
      { label: "31-60", value: 20 }
    ],
    exceptionsByRule: [{ ruleCode: "WRONG_WAREHOUSE", count: 4 }],
    stockByWarehouse: [{ warehouseId: 1, warehouseCode: "WH-1", count: 100 }],
    recentGrns: [{ grnId: 11, warehouseCode: "WH-1", status: "CLOSED", createdAt: "2026-06-06T09:00:00Z" }],
    recentDispatches: [{ dispatchId: 22, invoiceId: 5, warehouseCode: "WH-1", status: "DISPATCHED", createdAt: "2026-06-06T09:00:00Z" }],
    ...overrides
  };
}

beforeEach(() => {
  summaryMock.mockReset();
  dashboardPermissions = new Set(["ageing:read", "exception:read", "integration:import"]);
});

describe("DashboardPage — successful load", () => {
  test("renders KPI labels and ageing buckets", async () => {
    summaryMock.mockResolvedValue(buildSummary());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("GRNs In Progress")).toBeVisible();
    });
    expect(screen.getByText("Open Exceptions")).toBeVisible();
    expect(screen.getByText("Dispatches In Progress")).toBeVisible();
    expect(screen.getByText("0-30")).toBeVisible();
    expect(screen.getByText("31-60")).toBeVisible();
  });

  test("isolates the ageing chart viewport from the card header", async () => {
    summaryMock.mockResolvedValue(buildSummary());

    renderDashboard();

    const title = await screen.findByText("Inventory Ageing (Days In-Stock)");
    const card = title.closest(".card");
    expect(card).not.toBeNull();
    expect(within(card).getByTestId("card-header")).toContainElement(title);
    expect(within(card).getByTestId("card-body")).toContainElement(screen.getByTestId("bar-chart-viewport"));
  });

  test("renders recent activity widgets", async () => {
    summaryMock.mockResolvedValue(buildSummary());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Recent GRNs")).toBeVisible();
    });
    expect(screen.getByText("Recent Dispatches")).toBeVisible();
    expect(screen.getByText("GRN #11")).toBeVisible();
    expect(screen.getByText("Dispatch #22")).toBeVisible();
  });
});

describe("DashboardPage — empty load", () => {
  test("renders bar chart empty state when ageing has no buckets", async () => {
    summaryMock.mockResolvedValue(buildSummary({ ageingDistribution: [] }));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("GRNs In Progress")).toBeVisible();
    });
    expect(screen.getByText("No ageing data")).toBeVisible();
  });

  test("renders activity empty state when recent lists are empty", async () => {
    summaryMock.mockResolvedValue(buildSummary({ recentGrns: [], recentDispatches: [] }));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("No recent GRNs")).toBeVisible();
    });
    expect(screen.getByText("No recent dispatches")).toBeVisible();
  });
});

describe("DashboardPage — failed load", () => {
  test("does NOT crash when the summary endpoint fails", async () => {
    summaryMock.mockRejectedValue(new Error("Network down"));

    expect(() => renderDashboard()).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText("Unable to load dashboard")).toBeVisible();
    });
    const alert = screen.getByText("Unable to load dashboard").closest("[role='alert']");
    expect(within(alert).getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("surfaces the error message from the failed fetch", async () => {
    summaryMock.mockRejectedValue(new Error("Network down"));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Network down")).toBeVisible();
    });
  });

  test("does NOT show 'null' anywhere when load fails", async () => {
    summaryMock.mockRejectedValue(new Error("boom"));
    renderDashboard();
    await waitFor(() => {
      expect(screen.queryByText("null")).toBeNull();
    });
  });
});

describe("DashboardPage — retry", () => {
  test("clicking retry re-fetches the summary endpoint", async () => {
    summaryMock
      .mockRejectedValueOnce(new Error("first"))
      .mockResolvedValueOnce(buildSummary());

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Unable to load dashboard")).toBeVisible();
    });

    const alert = screen.getByText("Unable to load dashboard").closest("[role='alert']");
    fireEvent.click(within(alert).getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("GRNs In Progress")).toBeVisible();
    });
    expect(summaryMock).toHaveBeenCalledTimes(2);
  });
});

describe("DashboardPage — permission gating", () => {
  test("hides the exceptions-by-rule widget without exception:read", async () => {
    dashboardPermissions = new Set(["ageing:read"]);
    summaryMock.mockResolvedValue(buildSummary());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Inventory Status Breakdown")).toBeVisible();
    });
    expect(screen.queryByText("Open Exceptions by Rule")).toBeNull();
  });

  test("shows the exceptions-by-rule widget with exception:read", async () => {
    dashboardPermissions = new Set(["ageing:read", "exception:read"]);
    summaryMock.mockResolvedValue(buildSummary());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Open Exceptions by Rule")).toBeVisible();
    });
  });
});
