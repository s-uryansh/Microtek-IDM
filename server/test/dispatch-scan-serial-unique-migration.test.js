import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const migrationPath = resolve("../db/migrations/V025__dispatch_scan_drop_lifetime_serial_unique.sql");
const rollbackPath = resolve("../db/migrations/U025__dispatch_scan_drop_lifetime_serial_unique.sql");

describe("V025 drops the lifetime dispatch_scan serial-unique index", () => {
  test("drops ux_dispatch_scan_serial_once so returned serials can be re-dispatched", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("DROP INDEX IF EXISTS ux_dispatch_scan_serial_once");
    // It must NOT touch the partial active index introduced by V023.
    expect(sql).not.toContain("DROP INDEX IF EXISTS ux_dispatch_scan_active");
  });

  test("rollback restores the V005 lifetime index", () => {
    const sql = readFileSync(rollbackPath, "utf8");

    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_scan_serial_once");
    expect(sql).toContain("ON dispatch_scan(serial_id)");
  });
});
