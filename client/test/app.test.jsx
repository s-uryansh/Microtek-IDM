import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App.jsx";
import { Sidebar } from "../src/components/layout/Sidebar.jsx";

const useAuthMock = vi.fn();

vi.mock("../src/auth/useAuth.js", () => ({
  useAuth: () => useAuthMock()
}));

// Permissions granted to each built-in role, mirroring the server RBAC map. Used
// to drive permission-aware sidebar gating in these tests.
const ALL_PERMISSIONS = [
  "grn:write", "dispatch:write", "srn:write", "battery:read",
  "fulfilment:read", "ageing:read", "serial-history:read", "exception:read",
  "integration:import", "admin:access"
];
const SUPERVISOR_PERMISSIONS = [
  "grn:write", "dispatch:write", "srn:write", "battery:read",
  "fulfilment:read", "ageing:read", "serial-history:read", "exception:read"
];

function hasPermissionFrom(permissions) {
  const set = new Set(permissions);
  return (permission) => set.has(permission);
}

describe("App shell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
    useAuthMock.mockReturnValue({
      user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1, 2, 3], permissions: ALL_PERMISSIONS },
      isAuthenticated: true,
      loading: false,
      permissions: ALL_PERMISSIONS,
      hasPermission: hasPermissionFrom(ALL_PERMISSIONS),
      logout: vi.fn()
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1, 2, 3] }
      })
    });
  });

  test("renders the application shell with navigation for an authenticated user", async () => {
    render(<App />);

    expect(await screen.findByRole("link", { name: /dashboard/i })).toBeVisible();
    expect(screen.getByText("Microtek IDM")).toBeVisible();
    expect(screen.getByRole("link", { name: /dispatch/i })).toBeVisible();
  });
});

describe("Sidebar", () => {
  function renderSidebar(props = {}) {
    const { permissions = ALL_PERMISSIONS, ...sidebarProps } = props;
    useAuthMock.mockReturnValue({
      user: props.user ?? null,
      permissions,
      hasPermission: hasPermissionFrom(permissions),
      logout: vi.fn()
    });
    return render(
      <MemoryRouter>
        <Sidebar open={false} onClose={() => {}} {...sidebarProps} />
      </MemoryRouter>
    );
  }

  test("renders brand name and navigation links", () => {
    renderSidebar();

    expect(screen.getByText("Microtek IDM")).toBeVisible();
    expect(screen.getByRole("img", { name: "Microtek logo" })).toBeVisible();
    expect(screen.getByText("Dashboard")).toBeVisible();
    expect(screen.getByText("GRN")).toBeVisible();
    expect(screen.getByText("Dispatch")).toBeVisible();
    expect(screen.getByText("SRN")).toBeVisible();
    expect(screen.getByText("Battery Pre-Bill")).toBeVisible();
    expect(screen.getByText("Fulfilment")).toBeVisible();
    expect(screen.getByText("Ageing Report")).toBeVisible();
    expect(screen.getByText("Serial History")).toBeVisible();
    expect(screen.getByText("Exceptions")).toBeVisible();
    expect(screen.getByText("Import Monitor")).toBeVisible();
  });

  test("renders section headers", () => {
    renderSidebar();

    expect(screen.getByText("Operations")).toBeVisible();
    expect(screen.getByText("Monitoring")).toBeVisible();
    expect(screen.getByText("Administration")).toBeVisible();
  });

  test("hides admin-only links and the whole Administration section for a supervisor", () => {
    renderSidebar({ user: { name: "Alice", role: "supervisor" }, permissions: SUPERVISOR_PERMISSIONS });

    // Supervisor lacks integration:import and admin:access, so the whole section drops.
    expect(screen.queryByText("Admin Panel")).toBeNull();
    expect(screen.queryByText("Import Monitor")).toBeNull();
    expect(screen.queryByText("Administration")).toBeNull();
    // But permitted links remain.
    expect(screen.getByText("Ageing Report")).toBeVisible();
    expect(screen.getByText("Dispatch")).toBeVisible();
  });

  test("hides monitoring links a warehouse operator lacks permission for", () => {
    renderSidebar({
      user: { name: "Olive", role: "warehouse_operator" },
      permissions: ["grn:write", "dispatch:write", "srn:write", "battery:read", "fulfilment:read", "exception:read"]
    });

    expect(screen.queryByText("Ageing Report")).toBeNull();
    expect(screen.queryByText("Serial History")).toBeNull();
    expect(screen.getByText("Exceptions")).toBeVisible();
    expect(screen.getByText("Fulfilment")).toBeVisible();
  });

  test("shows the admin panel link for admin users", () => {
    renderSidebar({ user: { name: "Admin", role: "admin" } });

    expect(screen.getByText("Admin Panel")).toBeVisible();
  });

  test("renders user info in footer", () => {
    renderSidebar({ user: { name: "Alice", role: "supervisor" } });

    expect(screen.getByText("Alice")).toBeVisible();
    expect(screen.getByText("supervisor")).toBeVisible();
  });

  test("does not show overlay when closed", () => {
    const { container } = renderSidebar({ open: false });

    expect(container.querySelector(".sidebar-overlay")).toBeNull();
  });
});
