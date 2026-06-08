import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useScanSession } from "../../src/hooks/useScanSession.js";

function SessionHarness({ onScan }) {
  const session = useScanSession({ module: "GRN", onScan });

  return (
    <div>
      <button type="button" onClick={() => session.submitScan("  abc-123  ")}>
        Scan A
      </button>
      <button type="button" onClick={() => session.submitScan("ABC-123")}>
        Scan Duplicate
      </button>
      <span data-testid="state">{session.feedbackState}</span>
      <span data-testid="pending">{String(session.pending)}</span>
      <span data-testid="count">{session.scans.length}</span>
      <span data-testid="last">{session.lastScan?.serialNo ?? ""}</span>
      <span data-testid="message">{session.lastScan?.message ?? ""}</span>
      <span data-testid="paused">{String(session.paused)}</span>
      <button type="button" onClick={session.pause}>
        Pause
      </button>
      <button type="button" onClick={session.resume}>
        Resume
      </button>
    </div>
  );
}

describe("useScanSession", () => {
  test("normalizes serials, stores successful scans, and exposes success feedback", async () => {
    const onScan = vi.fn().mockResolvedValue({
      status: "MATCHED",
      message: "Serial matched",
      state: "success"
    });

    render(<SessionHarness onScan={onScan} />);

    await act(async () => {
      screen.getByText("Scan A").click();
    });

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
    expect(onScan).toHaveBeenCalledWith("ABC-123");
    expect(screen.getByTestId("last")).toHaveTextContent("ABC-123");
    expect(screen.getByTestId("state")).toHaveTextContent("success");
  });

  test("rejects duplicate scans before calling the API", async () => {
    const onScan = vi.fn().mockResolvedValue({ status: "MATCHED", state: "success" });

    render(<SessionHarness onScan={onScan} />);

    await act(async () => {
      screen.getByText("Scan A").click();
    });
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));

    await act(async () => {
      screen.getByText("Scan Duplicate").click();
    });

    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("message")).toHaveTextContent("Duplicate scan ignored");
    expect(screen.getByTestId("state")).toHaveTextContent("warning");
  });

  test("suppresses repeated duplicate warnings during cooldown", async () => {
    const onScan = vi.fn().mockResolvedValue({ status: "MATCHED", state: "success" });

    render(<SessionHarness onScan={onScan} />);

    await act(async () => {
      screen.getByText("Scan A").click();
    });
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));

    await act(async () => {
      screen.getByText("Scan Duplicate").click();
    });
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("2"));

    await act(async () => {
      screen.getByText("Scan Duplicate").click();
      screen.getByText("Scan Duplicate").click();
    });

    expect(screen.getByTestId("count")).toHaveTextContent("2");
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  test("does not submit scans while paused", async () => {
    const onScan = vi.fn();

    render(<SessionHarness onScan={onScan} />);

    await act(async () => {
      screen.getByText("Pause").click();
      screen.getByText("Scan A").click();
    });

    expect(onScan).not.toHaveBeenCalled();
    expect(screen.getByTestId("paused")).toHaveTextContent("true");
  });
});
