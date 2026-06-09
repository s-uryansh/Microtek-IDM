import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { createExceptionRepository } from "../src/db/exceptionRepository.js";

function captureRepository(rows = [{ exceptionId: 1, ruleCode: "WRONG_WAREHOUSE", status: "OPEN" }]) {
  const calls = [];
  const repository = createExceptionRepository({
    async query(sql, values) {
      calls.push({ sql, values });
      // count query returns a total; data/insert queries return rows.
      if (/COUNT\(\*\)/.test(sql)) {
        return { rows: [{ total: rows.length }] };
      }
      return { rows };
    }
  });
  return { repository, calls };
}

describe("exception_log warehouse scoping", () => {
  test("persists the resolved warehouse_id at creation time", async () => {
    const { repository, calls } = captureRepository();

    await repository.createException({
      serialNo: "MTK1234567890",
      ruleCode: "WRONG_WAREHOUSE",
      contextType: "BATTERY",
      contextId: 42,
      warehouseId: 7,
      raisedBy: "operator_1",
      createdBy: "operator_1"
    });

    expect(calls[0].sql).toContain("warehouse_id");
    expect(calls[0].values).toEqual([
      "MTK1234567890",
      "WRONG_WAREHOUSE",
      "BATTERY",
      42,
      null,
      7,
      "operator_1",
      "operator_1"
    ]);
  });

  test("stores NULL when no warehouse is resolvable", async () => {
    const { repository, calls } = captureRepository();

    await repository.createException({
      serialNo: null,
      ruleCode: "MALFORMED_SERIAL",
      contextType: "FOUNDATION",
      raisedBy: "operator_1",
      createdBy: "operator_1"
    });

    // warehouse_id is the 6th positional parameter.
    expect(calls[0].values[5]).toBeNull();
  });

  test("scopes findAll on the persisted warehouse_id with a join fallback", async () => {
    const { repository, calls } = captureRepository([]);

    await repository.findAll({ warehouseIds: [4, 7], limit: 50, offset: 0 });

    const filtered = calls.filter((call) =>
      call.sql.includes("COALESCE(e.warehouse_id, g.receiving_warehouse_id, d.warehouse_id, s.receiving_warehouse_id)")
    );
    // Both the count and the data query must apply the resolved-warehouse filter.
    expect(filtered.length).toBeGreaterThanOrEqual(2);
    expect(filtered.some((call) => call.sql.includes("= ANY($1::bigint[])"))).toBe(true);
    expect(calls.some((call) => Array.isArray(call.values) && call.values[0] && call.values[0][0] === 4)).toBe(true);
  });

  test("exposes the resolved warehouse on single-exception lookups", async () => {
    const { repository, calls } = captureRepository([
      { exceptionId: 1, warehouseId: 7, contextType: "BATTERY" }
    ]);

    const result = await repository.findById(1);

    expect(calls[0].sql).toContain(
      "COALESCE(e.warehouse_id, g.receiving_warehouse_id, d.warehouse_id, s.receiving_warehouse_id) AS \"warehouseId\""
    );
    expect(result.warehouseId).toBe(7);
  });
});

describe("V011 exception warehouse-scope migration", () => {
  const migration = readFileSync(
    resolve(import.meta.dirname, "../../db/migrations/V011__exception_warehouse_scope.sql"),
    "utf8"
  );
  const rollback = readFileSync(
    resolve(import.meta.dirname, "../../db/migrations/U011__exception_warehouse_scope.sql"),
    "utf8"
  );

  test("adds warehouse_id additively and backfills resolvable contexts", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouse(warehouse_id)");
    expect(migration).toContain("context_type = 'GRN'");
    expect(migration).toContain("context_type = 'DISPATCH'");
    expect(migration).toContain("context_type = 'SRN'");
    expect(migration).toContain("context_type = 'BATTERY'");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS ix_exception_warehouse");
    // Additive only: must not drop/recreate the table.
    expect(migration).not.toContain("DROP TABLE");
  });

  test("rollback removes only the additions", () => {
    expect(rollback).toContain("DROP INDEX IF EXISTS ix_exception_warehouse");
    expect(rollback).toContain("DROP COLUMN IF EXISTS warehouse_id");
    expect(rollback).not.toContain("DROP TABLE");
  });
});
