import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Pagination } from "../../src/components/data/Pagination.jsx";

describe("Pagination", () => {
  test("renders nothing when totalPages is 1 or less", () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />
    );

    expect(container.innerHTML).toBe("");
  });

  test("renders page buttons", () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />
    );

    expect(screen.getByLabelText("Page 1")).toBeVisible();
    expect(screen.getByLabelText("Page 5")).toBeVisible();
  });

  test("highlights current page", () => {
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={() => {}} />
    );

    const activeBtn = screen.getByLabelText("Page 3");
    expect(activeBtn).toHaveAttribute("aria-current", "page");
  });

  test("disables previous button on first page", () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />
    );

    expect(screen.getByLabelText("Previous page")).toBeDisabled();
  });

  test("disables next button on last page", () => {
    render(
      <Pagination currentPage={5} totalPages={5} onPageChange={() => {}} />
    );

    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  test("calls onPageChange when page button is clicked", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />
    );

    fireEvent.click(screen.getByLabelText("Page 2"));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  test("calls onPageChange for previous and next buttons", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />
    );

    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });
});
