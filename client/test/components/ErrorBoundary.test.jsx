import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

import { ErrorBoundary } from "../../src/components/errors/ErrorBoundary.jsx";

function ThrowingChild() {
  throw new Error("Render failed");
}

describe("ErrorBoundary", () => {
  let consoleError;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test("renders fallback UI and calls the error logger when a child throws", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError} fallbackMessage="Fallback shown">
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeVisible();
    expect(screen.getByText("Fallback shown")).toBeVisible();
    expect(onError).toHaveBeenCalled();
  });

  test("retry resets the boundary and renders children again", () => {
    function MaybeThrows({ shouldThrow }) {
      if (shouldThrow) throw new Error("Render failed");
      return <div>Recovered content</div>;
    }

    const { rerender } = render(
      <ErrorBoundary fallbackMessage="Fallback shown">
        <MaybeThrows shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText("Fallback shown")).toBeVisible();
    rerender(
      <ErrorBoundary fallbackMessage="Fallback shown">
        <MaybeThrows shouldThrow={false} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(screen.getByText("Recovered content")).toBeVisible();
  });
});
