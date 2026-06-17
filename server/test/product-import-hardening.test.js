import { describe, expect, test } from "vitest";

import { createAdminService } from "../src/admin/adminService.js";

function buildService({ upsert } = {}) {
  const adminRepo = {
    async upsertProduct(input) {
      if (upsert) return upsert(input);
      return { productId: 1, productCode: input.productCode, name: input.name };
    }
  };
  return createAdminService({ repositories: {}, adminRepo });
}

function csv(rows) {
  return ["product_code,name,segment", ...rows].join("\n");
}

describe("product import hardening", () => {
  test("rejects an invalid product_code and an oversized name with safe messages", async () => {
    const service = buildService();
    const longName = "x".repeat(201);
    const content = csv([`bad code!,Valid Name,INVERTER`, `GOOD-1,${longName},INVERTER`]);

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/product_code/);
    expect(result.errors[1].message).toMatch(/name/);
  });

  test("warns on duplicate product codes within the file", async () => {
    const service = buildService();
    const content = csv([`DUP-1,First,INVERTER`, `DUP-1,Second,INVERTER`]);

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.imported).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(/Duplicate product_code/);
  });

  test("rejects an import that exceeds the row cap", async () => {
    const service = buildService();
    const rows = Array.from({ length: 5001 }, (_, i) => `P-${i},Name ${i},INVERTER`);
    const content = csv(rows);

    await expect(service.importProductsCsv({ csvContent: content, userId: "admin" })).rejects.toMatchObject({
      status: 400
    });
  });

  test("does not leak raw DB error messages from a failed row", async () => {
    const service = buildService({
      upsert: () => {
        throw new Error('duplicate key value violates unique constraint "product_pkey"');
      }
    });
    const content = csv([`GOOD-1,Valid Name,INVERTER`]);

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe("Failed to import row");
    expect(result.errors[0].message).not.toMatch(/constraint|product_pkey/);
  });
});
