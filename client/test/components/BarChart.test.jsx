import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

import { BarChart } from "../../src/components/charts/BarChart.jsx";

describe("BarChart", () => {
  test("renders an isolated chart viewport with separate plot and labels", () => {
    render(
      <BarChart
        data={[
          { label: "0-30", value: 100 },
          { label: "31-60", value: 50 }
        ]}
      />
    );

    const chart = screen.getByRole("figure", { name: "Bar chart" });
    const viewport = within(chart).getByTestId("bar-chart-viewport");
    expect(within(viewport).getByTestId("bar-chart-plot")).toBeVisible();
    expect(within(viewport).getByTestId("bar-chart-labels")).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  test("renders the empty dataset state without a plot", () => {
    render(<BarChart data={[]} emptyMessage="No ageing data available" />);

    expect(screen.getByText("No ageing data available")).toBeVisible();
    expect(screen.queryByTestId("bar-chart-plot")).toBeNull();
  });

  test("renders a single bar with a bounded percentage height", () => {
    render(<BarChart data={[{ label: "91+", value: 25 }]} />);

    const bar = screen.getByRole("img", { name: "91+: 25" });
    expect(bar).toHaveStyle({ "--bar-height": "100%" });
  });

  test("renders multiple bars with proportional bounded heights", () => {
    render(
      <BarChart
        data={[
          { label: "0-30", value: 100 },
          { label: "31-60", value: 25 }
        ]}
      />
    );

    expect(screen.getByRole("img", { name: "0-30: 100" })).toHaveStyle({ "--bar-height": "100%" });
    expect(screen.getByRole("img", { name: "31-60: 25" })).toHaveStyle({ "--bar-height": "25%" });
  });

  test("keeps very large values inside the viewport scale", () => {
    render(
      <BarChart
        data={[
          { label: "A", value: 1 },
          { label: "B", value: 1_000_000_000 }
        ]}
      />
    );

    expect(screen.getByRole("img", { name: "B: 1,000,000,000" })).toHaveStyle({ "--bar-height": "100%" });
  });

  test("allows tooltips to render outside the chart viewport", () => {
    const css = readFileSync("src/styles/charts.css", "utf8");

    expect(css).toMatch(/\.bar-chart__viewport\s*{[^}]*overflow:\s*visible;/s);
    expect(css).toMatch(/\.bar-chart__tooltip\s*{[^}]*z-index:\s*1000;/s);
  });
});
