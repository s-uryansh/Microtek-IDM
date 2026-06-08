import { describe, expect, test } from "vitest";

import { sanitizeCsvCell } from "../src/utils/sanitizeCsvCell.js";

describe("sanitizeCsvCell", () => {
  describe("formula injection prefixes", () => {
    test.each(["=", "+", "-", "@"])("prefixes a leading %s with a single quote", (char) => {
      expect(sanitizeCsvCell(`${char}cmd`)).toBe(`'${char}cmd`);
    });

    test("neutralizes a classic spreadsheet command injection by prefixing", () => {
      // The formula-prefix branch wins and returns early, so quotes are not
      // doubled here — the leading quote is what defuses the formula.
      expect(sanitizeCsvCell('=HYPERLINK("http://evil")')).toBe(
        "'=HYPERLINK(\"http://evil\")"
      );
    });
  });

  describe("quoting of structural characters", () => {
    test("wraps values containing a comma in quotes", () => {
      expect(sanitizeCsvCell("a,b")).toBe('"a,b"');
    });

    test("wraps values containing a newline in quotes", () => {
      expect(sanitizeCsvCell("line1\nline2")).toBe('"line1\nline2"');
      expect(sanitizeCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
    });

    test("doubles embedded double-quotes and wraps", () => {
      expect(sanitizeCsvCell('say "hi"')).toBe('"say ""hi"""');
    });
  });

  describe("passthrough and coercion", () => {
    test("returns plain safe strings unchanged", () => {
      expect(sanitizeCsvCell("SERIAL-001")).toBe("SERIAL-001");
    });

    test("coerces null and undefined to empty string", () => {
      expect(sanitizeCsvCell(null)).toBe("");
      expect(sanitizeCsvCell(undefined)).toBe("");
    });

    test("coerces numbers to their string form", () => {
      expect(sanitizeCsvCell(42)).toBe("42");
    });

    test("prefixes a negative number string because it starts with '-'", () => {
      expect(sanitizeCsvCell(-5)).toBe("'-5");
    });
  });
});
