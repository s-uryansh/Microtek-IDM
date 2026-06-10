import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const seedSource = readFileSync(resolve(import.meta.dirname, "../src/db/seed-dev.js"), "utf8");
const rootPackageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../package.json"), "utf8"));
const serverPackageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));

describe("development seed data", () => {
  test("keeps seeded invoices large enough for 10-unit invoice testing", () => {
    expect(seedSource).toContain("MTK-INV1K-0010");
    expect(seedSource).toContain("MTK-SOL300-0010");
    expect(seedSource).toContain("MTK-BAT100-0010");
    expect(seedSource).toContain("MTK-RET-0010");
    expect(seedSource).toContain("MTK-ACCCHG-0010");
    expect(seedSource).toContain("INV-001 lines: 5x Microtek Inverter 1KVA, 5x Microtek Solar Panel 300W");
    expect(seedSource).toContain("INV-002 lines: 3x Microtek Inverter 2KVA, 2x Microtek Solar Panel 500W, 5x Microtek Charge Controller");
  });

  test("uses realistic Microtek product codes and serial identifiers", () => {
    expect(seedSource).not.toMatch(/DEMO-/);
    expect(seedSource).not.toMatch(/SKU-/);
    expect(seedSource).toContain("MTK-INVERTER-1KVA");
    expect(seedSource).toContain("Microtek Inverter 1KVA");
    expect(seedSource).toContain("MTK-BATTERY-100AH");
    expect(seedSource).toContain("MTK-SOLAR-300W");
  });

  test("exposes a direct command for removing seeded data", () => {
    expect(rootPackageJson.scripts["seed:remove"]).toBe("npm run seed:remove --workspace server");
    expect(serverPackageJson.scripts["seed:remove"]).toBe("node src/db/seed-dev.js teardown");
  });

  test("removes auth sessions before seeded users during teardown", () => {
    const authSessionDelete = seedSource.indexOf("DELETE FROM auth_session");
    const appUserDelete = seedSource.indexOf("DELETE FROM app_user WHERE created_by = $1");

    expect(authSessionDelete).toBeGreaterThan(-1);
    expect(authSessionDelete).toBeLessThan(appUserDelete);
  });
});
