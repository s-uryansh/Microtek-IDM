import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { TopBar } from "../../src/components/layout/TopBar.jsx";

const fetchExceptionsMock = vi.fn();

vi.mock("../../src/api/modules/exceptions.js", () => ({
  fetchExceptions: (...args) => fetchExceptionsMock(...args)
}));

describe("TopBar", () => {
  beforeEach(() => {
    fetchExceptionsMock.mockReset();
  });

  test("hides the notification dot by default", () => {
    const { container } = render(<TopBar onMenuToggle={vi.fn()} />);

    expect(container.querySelector(".top-bar__action-badge")).toBeNull();
    expect(fetchExceptionsMock).not.toHaveBeenCalled();
  });

  test("does not treat open exceptions as notifications", () => {
    fetchExceptionsMock.mockResolvedValue({ exceptions: [{ exceptionId: 1 }], total: 1 });

    const { container } = render(<TopBar onMenuToggle={vi.fn()} />);

    expect(container.querySelector(".top-bar__action-badge")).toBeNull();
    expect(fetchExceptionsMock).not.toHaveBeenCalled();
  });

  test("shows the notification dot when explicit notifications exist", () => {
    const { container } = render(<TopBar onMenuToggle={vi.fn()} notificationCount={1} />);

    expect(container.querySelector(".top-bar__action-badge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });
});
