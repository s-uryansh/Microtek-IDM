import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(import.meta.dirname, "../../db/migrations/V004__ageing_reconciliation.sql");
const rollbackPath = resolve(import.meta.dirname, "../../db/migrations/U004__ageing_reconciliation.sql");

describe("V004 ageing and reconciliation migration", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");

  test("creates ageing report structures based on serial_master.received_at", () => {
    expect(migration).toContain("CREATE MATERIALIZED VIEW IF NOT EXISTS ageing_serial_snapshot");
    expect(migration).toContain("serial_master");
    expect(migration).toContain("received_at");
    expect(migration).toContain("age_days");
    expect(migration).toContain("missing_received_at");
  });

  test("adds indexes for ageing and reporting queries", () => {
    expect(migration).toContain("ix_serial_ageing_report");
    expect(migration).toContain("ix_ageing_snapshot_wh_product");
    expect(migration).toContain("ix_ageing_snapshot_missing_received");
  });

  test("creates opening-stock reconciliation foundation without threshold business rules", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS opening_stock_reconciliation_run");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS opening_stock_reconciliation_line");
    expect(migration).toContain("sap_quantity");
    expect(migration).toContain("idm_quantity");
    expect(migration).not.toContain("variance_threshold");
  });

  test("rollback drops V004 objects in dependency order", () => {
    const statements = rollback
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(statements).toEqual([
      "DROP TABLE IF EXISTS opening_stock_reconciliation_line;",
      "DROP TABLE IF EXISTS opening_stock_reconciliation_run;",
      "DROP MATERIALIZED VIEW IF EXISTS ageing_serial_snapshot;"
    ]);
  });
});
