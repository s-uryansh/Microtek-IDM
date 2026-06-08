import { describe, expect, test } from "vitest";

import { parseCsv, toCsv } from "../../src/utils/csv.js";

describe("CSV utilities", () => {
  test("parses headers, rows, and row numbers", () => {
    const result = parseCsv("serial_no,condition_tag\nSN-001,SALEABLE\nSN-002,DEFECTIVE");

    expect(result.headers).toEqual(["serial_no", "condition_tag"]);
    expect(result.rows).toEqual([
      { rowNumber: 2, serial_no: "SN-001", condition_tag: "SALEABLE" },
      { rowNumber: 3, serial_no: "SN-002", condition_tag: "DEFECTIVE" }
    ]);
  });

  test("escapes CSV cells that contain commas and quotes", () => {
    expect(toCsv([{ serial_no: "SN-001", message: "Rejected, \"wrong\"" }], ["serial_no", "message"]))
      .toBe("serial_no,message\nSN-001,\"Rejected, \"\"wrong\"\"\"");
  });
});
