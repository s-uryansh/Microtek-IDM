import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ScanInput } from "../../src/components/scan/ScanInput.jsx";

describe("ScanInput", () => {
  test("renders label and input field", () => {
    render(
      <ScanInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(screen.getByLabelText("Scan Serial")).toBeVisible();
    expect(screen.getByPlaceholderText("Scan or enter serial number")).toBeVisible();
  });

  test("calls onSubmit with trimmed value on Enter", () => {
    const onSubmit = vi.fn();
    render(
      <ScanInput
        value="MTK001"
        onChange={() => {}}
        onSubmit={onSubmit}
      />
    );

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("MTK001");
  });

  test("does not call onSubmit when disabled", () => {
    const onSubmit = vi.fn();
    render(
      <ScanInput
        value="MTK001"
        onChange={() => {}}
        onSubmit={onSubmit}
        disabled
      />
    );

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("does not call onSubmit for empty input", () => {
    const onSubmit = vi.fn();
    render(
      <ScanInput
        value="  "
        onChange={() => {}}
        onSubmit={onSubmit}
      />
    );

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("displays hint text", () => {
    render(
      <ScanInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(screen.getByText("Press Enter to submit")).toBeVisible();
  });

  test("calls onChange when input value changes", () => {
    const onChange = vi.fn();
    render(
      <ScanInput
        value=""
        onChange={onChange}
        onSubmit={() => {}}
      />
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "MTK" } });

    expect(onChange).toHaveBeenCalledWith("MTK");
  });
});
