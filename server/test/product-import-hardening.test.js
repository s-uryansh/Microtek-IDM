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
  return ["Product Code(*),Product Name(*),Category(*),Sub Category(*)", ...rows].join("\n");
}

describe("product import hardening", () => {
  test("rejects an invalid product_code and an oversized name with safe messages", async () => {
    const service = buildService();
    const longName = "x".repeat(201);
    const content = csv([`bad code!,Valid Name,INVERTER,GENERAL`, `GOOD-1,${longName},INVERTER,GENERAL`]);

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/Product Code/);
    expect(result.errors[1].message).toMatch(/Product Name/);
  });

  test("warns on duplicate product codes within the file", async () => {
    const service = buildService();
    const content = csv([`DUP-1,First,INVERTER,GENERAL`, `DUP-1,Second,INVERTER,GENERAL`]);

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.imported).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(/Duplicate product_code/);
  });

  test("rejects an import that exceeds the row cap", async () => {
    const service = buildService();
    const rows = Array.from({ length: 5001 }, (_, i) => `P-${i},Name ${i},INVERTER,GENERAL`);
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
    const content = csv([`GOOD-1,Valid Name,INVERTER,GENERAL`]);

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe("Failed to import row");
    expect(result.errors[0].message).not.toMatch(/constraint|product_pkey/);
  });

  test("accepts the client's exact CSV header format, including the 'Warraanty' typo column", async () => {
    let captured;
    const service = buildService({
      upsert: (input) => {
        captured = input;
        return { productId: 1, productCode: input.productCode, name: input.name };
      }
    });
    const content = [
      "Product Code(*),Product Name(*),Category(*),Sub Category(*),Distributor Price,Warraanty,Gst,Mrp,Base Price,Stock,SBU,Poll,MOQ,Description,Product Category",
      "SPGS4050S2204P6252,SPGS-PWM4050-MS2206024TT4N-P625BW2N,PSD,SPGS,1000,36 months,18,1900,600,,SBU06,4,500,SPGS-PWM4050-MS2206024TT4N-P625BW2N,PSD"
    ].join("\n");

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(captured).toMatchObject({
      productCode: "SPGS4050S2204P6252",
      name: "SPGS-PWM4050-MS2206024TT4N-P625BW2N",
      category: "PSD",
      subCategory: "SPGS",
      distributorPrice: 1000,
      warranty: "36 months",
      gst: 18,
      mrp: 1900,
      basePrice: 600,
      stock: null,
      sbu: "SBU06",
      poll: "4",
      moq: 500,
      description: "SPGS-PWM4050-MS2206024TT4N-P625BW2N",
      productCategory: "PSD"
    });
  });

  test("accepts a category outside the old fixed enum (e.g. 'PSD')", async () => {
    const service = buildService();
    const content = csv([`PSD-1,Some Product,PSD,SPGS`]);

    const result = await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("derives is_battery from a category/sub-category containing 'BATTERY'", async () => {
    let captured;
    const service = buildService({
      upsert: (input) => {
        captured = input;
        return { productId: 1, productCode: input.productCode, name: input.name };
      }
    });
    const content = csv([`BAT-1,Some Battery,BATTERY,LITHIUM`]);

    await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(captured.isBattery).toBe(true);
  });

  test("does not mark a non-battery category as is_battery", async () => {
    let captured;
    const service = buildService({
      upsert: (input) => {
        captured = input;
        return { productId: 1, productCode: input.productCode, name: input.name };
      }
    });
    const content = csv([`INV-1,Some Inverter,INVERTER,PWM`]);

    await service.importProductsCsv({ csvContent: content, userId: "admin" });

    expect(captured.isBattery).toBe(false);
  });
});
