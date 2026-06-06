import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(import.meta.dirname, "../../db/migrations/V003__invoice_dispatch.sql");
const rollbackPath = resolve(import.meta.dirname, "../../db/migrations/U003__invoice_dispatch.sql");

describe("V003 invoice and dispatch migration", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");

  test("creates Sprint 2 invoice and dispatch tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS invoice");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS invoice_line");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS dispatch");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS dispatch_scan");
  });

  test("supports only approved dispatch status states in database logic", () => {
    expect(migration).toContain("'PENDING'");
    expect(migration).toContain("'IN_PROGRESS'");
    expect(migration).toContain("'DISPATCHED'");
    expect(migration).not.toContain("'PARTIAL'");
  });

  test("preserves future SAP outbound compatibility without creating outbound transport", () => {
    expect(migration).toContain("sap_invoice_ref");
    expect(migration).toContain("sap_outbound_batch_id");
    expect(migration).toContain("UNIQUE (dispatch_id, serial_id)");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS sap_outbound");
  });

  test("rollback drops V003 tables in dependency order", () => {
    const statements = rollback
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(statements).toEqual([
      "DROP TABLE IF EXISTS dispatch_scan;",
      "DROP TABLE IF EXISTS dispatch;",
      "DROP TABLE IF EXISTS invoice_line;",
      "DROP TABLE IF EXISTS invoice;"
    ]);
  });
});
