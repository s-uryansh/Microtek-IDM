import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../src/App.jsx";
import { Sidebar } from "../src/components/layout/Sidebar.jsx";

describe("App shell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1, 2, 3] }
      })
    });
  });

  test("renders the application shell with navigation for an authenticated user", async () => {
    render(<App />);

    expect(await screen.findByText("Microtek IDM")).toBeVisible();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /dispatch/i })).toBeVisible();
  });
});

describe("Sidebar", () => {
  function renderSidebar(props = {}) {
    return render(
      <MemoryRouter>
        <Sidebar open={false} onClose={() => {}} {...props} />
      </MemoryRouter>
    );
  }

  test("renders brand name and navigation links", () => {
    renderSidebar();

    expect(screen.getByText("Microtek IDM")).toBeVisible();
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
