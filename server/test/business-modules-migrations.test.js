import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const migrationPath = resolve("../db/migrations/V006__grn_srn_history.sql");
const rollbackPath = resolve("../db/migrations/U006__grn_srn_history.sql");

describe("V006 GRN, SRN, and serial history migration", () => {
  test("creates GRN and sender dispatch document structures", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sap_dispatch_doc");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sap_dispatch_line");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS grn");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS grn_scan");
    expect(sql).toContain("MATCHED");
    expect(sql).toContain("SHORT");
    expect(sql).toContain("EXCESS");
    expect(sql).toContain("WRONG_SERIAL");
    expect(sql).toContain("DUPLICATE_SCAN");
  });

  test("creates SRN structures with configurable condition tag support", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS srn");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS srn_scan");
    expect(sql).toContain("condition_tag");
    expect(sql).toContain("original_dispatch_scan_id");
    expect(sql).toContain("ux_srn_scan_serial_once");
  });

  test("adds history lookup indexes and extends exception rule codes", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ix_serial_event_timeline");
    expect(sql).toContain("ix_exception_serial_context");
    expect(sql).toContain("DUPLICATE_SCAN");
    expect(sql).toContain("NO_ORIGINAL_DISPATCH");
    expect(sql).toContain("ALREADY_RETURNED");
  });

  test("provides paired rollback for V006 objects", () => {
    const sql = readFileSync(rollbackPath, "utf8");

    expect(sql).toContain("DROP TABLE IF EXISTS srn_scan");
    expect(sql).toContain("DROP TABLE IF EXISTS srn");
    expect(sql).toContain("DROP TABLE IF EXISTS grn_scan");
    expect(sql).toContain("DROP TABLE IF EXISTS grn");
    expect(sql).toContain("DROP TABLE IF EXISTS sap_dispatch_line");
    expect(sql).toContain("DROP TABLE IF EXISTS sap_dispatch_doc");
  });
});
