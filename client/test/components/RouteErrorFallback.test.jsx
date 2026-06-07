import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, test } from "vitest";

import { RouteErrorFallback } from "../../src/components/errors/RouteErrorFallback.jsx";

function renderRouteError(error) {
  const router = createMemoryRouter([
    {
      path: "/",
      loader: () => {
        throw error;
      },
      element: <div>Should not render</div>,
      errorElement: <RouteErrorFallback />
    }
  ]);

  return render(<RouterProvider router={router} />);
}

describe("RouteErrorFallback", () => {
  test("renders route response status and message", async () => {
    renderRouteError(new Response("Missing route", { status: 404, statusText: "Not Found" }));

    expect(await screen.findByText("404 — Not Found")).toBeVisible();
    expect(screen.getByText("Missing route")).toBeVisible();
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /go to dashboard/i })).toBeVisible();
  });

  test("renders a generic fallback for unexpected route errors", async () => {
    renderRouteError(new Error("Loader failed"));

    expect(await screen.findByText("Unexpected application error")).toBeVisible();
    expect(screen.getByText("Loader failed")).toBeVisible();
  });
});
