import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

function readRepository(fileName) {
  return readFileSync(resolve(`src/db/${fileName}`), "utf8");
}

describe("business module repository SQL contracts", () => {
  test("GRN repository uses parameterized queries and idempotent scan insertion", () => {
    const sql = readRepository("grnRepository.js");

    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("$1");
    expect(sql).toContain("$2::varchar");
  });

  test("SRN repository protects duplicate returns with parameterized insert", () => {
    const sql = readRepository("srnRepository.js");

    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("FROM srn_scan WHERE serial_id = $1");
    expect(sql).toContain("FOR UPDATE");
  });

  test("dispatch repository casts status parameter used in CASE expression", () => {
    const sql = readRepository("dispatchRepository.js");

    expect(sql).toContain("$2::varchar = 'DISPATCHED'");
  });

  test("serial history repository orders event and exception lookups chronologically", () => {
    const sql = readRepository("serialHistoryRepository.js");

    expect(sql).toContain("ORDER BY event_at, event_id");
    expect(sql).toContain("ORDER BY raised_at, exception_id");
    expect(sql).toContain("WHERE serial_no = $1");
  });
});
