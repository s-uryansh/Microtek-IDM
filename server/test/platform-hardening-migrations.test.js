import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const migrationPath = resolve("../db/migrations/V005__platform_hardening.sql");
const rollbackPath = resolve("../db/migrations/U005__platform_hardening.sql");

describe("platform hardening migration", () => {
  test("adds idempotency and concurrency protections for dispatch scanning", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ux_dispatch_invoice_once");
    expect(sql).toContain("ON dispatch(invoice_id)");
    expect(sql).toContain("ux_dispatch_scan_serial_once");
    expect(sql).toContain("ON dispatch_scan(serial_id)");
    expect(sql).toContain("ix_dispatch_scan_line_count");
    expect(sql).toContain("ON dispatch_scan(dispatch_id, invoice_line_id)");
  });

  test("adds reporting and audit lookup indexes without editing prior migrations", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ix_serial_event_reference");
    expect(sql).toContain("ON serial_event(reference_type, reference_id)");
    expect(sql).toContain("ix_exception_context");
    expect(sql).toContain("ON exception_log(context_type, context_id)");
  });

  test("provides a paired rollback for hardening indexes", () => {
    const sql = readFileSync(rollbackPath, "utf8");

    expect(sql).toContain("DROP INDEX IF EXISTS ux_dispatch_scan_serial_once");
    expect(sql).toContain("DROP INDEX IF EXISTS ux_dispatch_invoice_once");
    expect(sql).toContain("DROP INDEX IF EXISTS ix_dispatch_scan_line_count");
    expect(sql).toContain("DROP INDEX IF EXISTS ix_serial_event_reference");
    expect(sql).toContain("DROP INDEX IF EXISTS ix_exception_context");
  });
});
