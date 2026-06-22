import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { TopBar } from "../../src/components/layout/TopBar.jsx";

const fetchExceptionsMock = vi.fn();

vi.mock("../../src/api/modules/exceptions.js", () => ({
  fetchExceptions: (...args) => fetchExceptionsMock(...args)
}));

function renderTopBar(props = {}) {
  return render(
    <MemoryRouter>
      <TopBar onMenuToggle={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

describe("TopBar", () => {
  beforeEach(() => {
    fetchExceptionsMock.mockReset();
  });

  test("hides the notification dot by default", () => {
    const { container } = renderTopBar();

    expect(container.querySelector(".top-bar__action-badge")).toBeNull();
    expect(fetchExceptionsMock).not.toHaveBeenCalled();
  });

  test("does not treat open exceptions as notifications", () => {
    fetchExceptionsMock.mockResolvedValue({ exceptions: [{ exceptionId: 1 }], total: 1 });

    const { container } = renderTopBar();

    expect(container.querySelector(".top-bar__action-badge")).toBeNull();
    expect(fetchExceptionsMock).not.toHaveBeenCalled();
  });

  test("shows the notification dot when explicit notifications exist", () => {
    const { container } = renderTopBar({ notificationCount: 1 });

    expect(container.querySelector(".top-bar__action-badge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });
});
