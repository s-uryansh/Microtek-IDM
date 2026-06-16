import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DataTable } from "../../src/components/data/DataTable.jsx";

const columns = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" }
];

const data = [
  { id: 1, name: "Alpha", status: "OPEN" },
  { id: 2, name: "Beta", status: "CLOSED" },
  { id: 3, name: "Gamma", status: "PENDING" }
];

describe("DataTable", () => {
  test("renders column headers", () => {
    render(<DataTable columns={columns} data={data} />);

    expect(screen.getByText("ID")).toBeVisible();
    expect(screen.getByText("Name")).toBeVisible();
    expect(screen.getByText("Status")).toBeVisible();
  });

  test("renders data rows", () => {
    render(<DataTable columns={columns} data={data} />);

    expect(screen.getByText("Alpha")).toBeVisible();
    expect(screen.getByText("Beta")).toBeVisible();
    expect(screen.getByText("Gamma")).toBeVisible();
  });

  test("renders status badges for status values", () => {
    render(<DataTable columns={columns} data={data} />);

    expect(screen.getByText("OPEN")).toBeVisible();
    expect(screen.getByText("CLOSED")).toBeVisible();
  });

  test("shows loading skeleton when loading is true", () => {
    const { container } = render(
      <DataTable columns={columns} data={null} loading />
    );

    expect(container.querySelector(".data-table__skeleton")).toBeTruthy();
  });

  test("shows empty state when data is empty", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyTitle="No items"
        emptyDescription="Nothing to show"
      />
    );

    expect(screen.getByText("No items")).toBeVisible();
    expect(screen.getByText("Nothing to show")).toBeVisible();
  });

  test("shows error state when error is provided", () => {
    render(
      <DataTable
        columns={columns}
        data={null}
        error="Network failure"
        onRetry={() => {}}
      />
    );

    expect(screen.getByText("Network failure")).toBeVisible();
    expect(screen.getByText("Retry")).toBeVisible();
  });

  test("sorts data when column header is clicked", () => {
    render(<DataTable columns={columns} data={data} />);

    const nameHeader = screen.getByLabelText(/Sort by Name/);
    fireEvent.click(nameHeader);

    const cells = screen.getAllByRole("cell").filter((cell) => /Alpha|Beta|Gamma/.test(cell.textContent));
    expect(cells[0]).toHaveTextContent("Alpha");
  });

  test("reverses sort order on second click", () => {
    render(<DataTable columns={columns} data={data} />);

    const nameHeader = screen.getByLabelText(/Sort by Name/);

    fireEvent.click(nameHeader);
    fireEvent.click(nameHeader);

    const cells = screen.getAllByRole("cell").filter((cell) => /Alpha|Beta|Gamma/.test(cell.textContent));
    expect(cells[0]).toHaveTextContent("Gamma");
  });

  test("filters by multiple columns at the same time", () => {
    render(<DataTable columns={columns} data={data} />);

    fireEvent.change(screen.getByLabelText("Filter Name"), { target: { value: "Alpha" } });
    fireEvent.change(screen.getByLabelText("Filter Status"), { target: { value: "OPEN" } });

    expect(screen.getByText("Alpha")).toBeVisible();
    expect(screen.queryByText("Beta")).toBeNull();
    expect(screen.queryByText("Gamma")).toBeNull();
  });
});
