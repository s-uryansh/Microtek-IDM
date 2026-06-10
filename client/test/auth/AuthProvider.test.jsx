import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { AuthProvider, useAuth } from "../../src/auth/AuthProvider.jsx";

function Harness() {
  const auth = useAuth();
  return (
    <div>
      <div>{auth.loading ? "loading" : "settled"}</div>
      <div>{auth.isAuthenticated ? auth.user.username : "anonymous"}</div>
      <button type="button" onClick={() => auth.login({ username: "admin", password: "admin123" })}>login</button>
      <button type="button" onClick={() => auth.logout()}>logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  test("loads the current user on startup", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1] } })
    });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeVisible();
    });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/me"), expect.objectContaining({ credentials: "include" }));
  });

  test("keeps startup in loading state until session restore finishes", async () => {
    let resolveMe;
    global.fetch.mockReturnValueOnce(new Promise((resolve) => {
      resolveMe = resolve;
    }));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    expect(screen.getByText("loading")).toBeVisible();
    expect(screen.getByText("anonymous")).toBeVisible();

    resolveMe({
      ok: true,
      json: () => Promise.resolve({ user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1] } })
    });

    await waitFor(() => expect(screen.getByText("settled")).toBeVisible());
    expect(screen.getByText("admin")).toBeVisible();
  });

  test("revalidates the session (and permissions) when the tab regains focus", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1], permissions: ["ageing:read"] } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1], permissions: [] } })
      });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("admin")).toBeVisible());
    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.focus(window);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/auth/me"),
      expect.objectContaining({ credentials: "include" })
    );
  });

  test("clears auth when session restore returns unauthorized", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: "UNAUTHORIZED", message: "Authentication required" } })
    });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("settled")).toBeVisible());
    expect(screen.getByText("anonymous")).toBeVisible();
  });

  test("logs in and logs out through the auth API", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1] } })
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => {
      expect(screen.getByText("admin")).toBeVisible();
    });

    fireEvent.click(screen.getByText("logout"));
    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeVisible();
    });
  });
});
