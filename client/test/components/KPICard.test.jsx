import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { KPICard } from "../../src/components/charts/KPICard.jsx";

describe("KPICard", () => {
  test("renders label, value and unit", () => {
    render(<KPICard label="Total Inventory" value={2847} unit="units" />);

    expect(screen.getByText("Total Inventory")).toBeVisible();
    expect(screen.getByText("2,847")).toBeVisible();
    expect(screen.getByText("units")).toBeVisible();
  });

  test("renders trend indicator when trend is provided", () => {
    render(
      <KPICard
        label="Test"
        value={100}
        trend={{ direction: "up", percentage: 5.2 }}
      />
    );

    expect(screen.getByText("5.2%")).toBeVisible();
  });

  test("renders loading skeleton when loading is true", () => {
    const { container } = render(<KPICard loading />);

    expect(container.querySelector(".skeleton")).toBeTruthy();
    expect(screen.queryByText("Total Inventory")).toBeNull();
  });

  test("formats number values with commas", () => {
    render(<KPICard label="Large" value={10000} />);

    expect(screen.getByText("10,000")).toBeVisible();
  });
});
