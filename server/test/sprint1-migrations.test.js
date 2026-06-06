import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(import.meta.dirname, "../../db/migrations/V002__serial_core_integration.sql");
const rollbackPath = resolve(import.meta.dirname, "../../db/migrations/U002__serial_core_integration.sql");

describe("V002 serial core migration", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");

  test("creates Sprint 1 serial, event, exception, and integration batch tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS serial_master");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS serial_event");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS exception_log");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS integration_batch");
  });

  test("keeps IDM-01 idempotent and IDM-06 exception-backed", () => {
    expect(migration).toContain("UNIQUE (direction, payload_type, external_ref)");
    expect(migration).toContain("CHECK (direction IN ('INBOUND','OUTBOUND'))");
    expect(migration).toContain("CHECK (rule_code IN");
    expect(migration).toContain("'NOT_FOUND'");
    expect(migration).toContain("'ALREADY_DISPATCHED'");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS ix_serial_status_wh");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS ix_event_serial_time");
  });

  test("does not create Sprint 2 or later feature tables", () => {
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS invoice");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS dispatch");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS grn");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS srn");
  });

  test("rollback drops V002 tables in dependency order", () => {
    expect(rollback.indexOf("DROP TABLE IF EXISTS exception_log")).toBeLessThan(
      rollback.indexOf("DROP TABLE IF EXISTS serial_event")
    );
    expect(rollback.indexOf("DROP TABLE IF EXISTS serial_event")).toBeLessThan(
      rollback.indexOf("DROP TABLE IF EXISTS serial_master")
    );
    expect(rollback).toContain("DROP TABLE IF EXISTS integration_batch");
  });
});
