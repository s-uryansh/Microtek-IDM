import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migrationPath = resolve(
  import.meta.dirname,
  "../../db/migrations/V001__foundation_reference_rbac.sql"
);

describe("V001 foundation migration", () => {
  const migration = readFileSync(migrationPath, "utf8");

  test("creates reference and RBAC tables without IDM feature tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS warehouse");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS product");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS role");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS app_user");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS role_permission");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS serial_master");
    expect(migration).not.toContain("CREATE TABLE IF NOT EXISTS integration_batch");
  });

  test("uses PostgreSQL conventions from AGENTS.md", () => {
    expect(migration).toContain("BIGSERIAL PRIMARY KEY");
    expect(migration).toContain("TIMESTAMPTZ");
    expect(migration).toContain("CHECK (type IN ('PLANT','CENTRAL','REGIONAL'))");
  });
});
