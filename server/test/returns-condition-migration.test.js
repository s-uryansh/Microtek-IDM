import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationDir = resolve(import.meta.dirname, "../../db/migrations");
const up = readFileSync(resolve(migrationDir, "V023__returns_condition_and_partial.sql"), "utf8");
const down = readFileSync(resolve(migrationDir, "U023__returns_condition_and_partial.sql"), "utf8");

describe("V023 returns condition + partial dispatch migration", () => {
  test("adds the serial condition tag with a constrained value set", () => {
    expect(up).toContain("ADD COLUMN IF NOT EXISTS condition_tag VARCHAR(16)");
    expect(up).toContain("condition_tag IN ('SALEABLE', 'DEFECTIVE', 'REPAIR')");
  });

  test("adds PARTIALLY_DISPATCHED to the invoice status set while keeping IN_PROGRESS", () => {
    expect(up).toContain("'PARTIALLY_DISPATCHED'");
    expect(up).toContain("'IN_PROGRESS'");
  });

  test("soft-returns dispatch scans via a partial unique index", () => {
    expect(up).toContain("ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ");
    expect(up).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_scan_active");
    expect(up).toContain("WHERE returned_at IS NULL");
  });

  test("captures the declared SRN return quantity", () => {
    expect(up).toContain("ADD COLUMN IF NOT EXISTS expected_quantity INTEGER");
  });

  test("adds the CONDITION_HOLD rule code and condition:correct permission", () => {
    expect(up).toContain("'CONDITION_HOLD'");
    expect(up).toContain("'condition:correct'");
  });

  test("rollback reverses every addition", () => {
    expect(down).toContain("DROP COLUMN IF EXISTS condition_tag");
    expect(down).toContain("DROP INDEX IF EXISTS ux_dispatch_scan_active");
    expect(down).toContain("DROP COLUMN IF EXISTS expected_quantity");
    expect(down).toContain("DELETE FROM role_permission WHERE permission_code = 'condition:correct'");
    expect(down).toContain("CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DISPATCHED'))");
  });
});
