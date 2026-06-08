import { describe, expect, test } from "vitest";
import { sanitizeCsvCell } from "../../src/utils/csvSanitize.js";

describe("csvSanitize", () => {
  test.each(["=", "+", "-", "@"])("prefixes a leading %s with a single quote", (char) => {
    expect(sanitizeCsvCell(`${char}SUM(A1)`)).toBe(`'${char}SUM(A1)`);
  });

  test("leaves safe values unchanged", () => {
    expect(sanitizeCsvCell("SERIAL-001")).toBe("SERIAL-001");
    expect(sanitizeCsvCell("a,b")).toBe("a,b");
  });

  test("coerces null and undefined to an empty string", () => {
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
  });

  test("coerces numbers to strings, prefixing negatives", () => {
    expect(sanitizeCsvCell(42)).toBe("42");
    expect(sanitizeCsvCell(-1)).toBe("'-1");
  });
});
