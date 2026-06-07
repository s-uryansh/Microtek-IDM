import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";

import { AuthContext } from "../../src/auth/AuthProvider.jsx";
import { ProtectedRoute } from "../../src/auth/ProtectedRoute.jsx";

function renderRoute(authValue) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route
            path="/dashboard"
            element={(
              <ProtectedRoute>
                <div>Dashboard Screen</div>
              </ProtectedRoute>
            )}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("ProtectedRoute", () => {
  test("redirects unauthenticated users to login", () => {
    renderRoute({ isAuthenticated: false, loading: false });

    expect(screen.getByText("Login Screen")).toBeVisible();
  });

  test("renders children for authenticated users", () => {
    renderRoute({ isAuthenticated: true, loading: false });

    expect(screen.getByText("Dashboard Screen")).toBeVisible();
  });
});
