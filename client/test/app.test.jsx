import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { App } from "../src/App.jsx";

describe("React foundation", () => {
  test("renders the Sprint 0 shell without feature navigation", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Microtek IDM" })).toBeVisible();
    expect(screen.getByText("Sprint 0 foundation")).toBeVisible();
    expect(screen.queryByText("Dispatch Scan")).not.toBeInTheDocument();
  });
});
