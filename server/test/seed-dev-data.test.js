import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

// seed-dev.js is a thin orchestrator; its actual seed logic/data lives in the
// sibling seedDev/*.js modules it imports. Concatenate all of them so these
// content assertions stay valid regardless of how the logic is split across files.
const seedDevDir = resolve(import.meta.dirname, "../src/db/seedDev");
const seedSource = [
  readFileSync(resolve(import.meta.dirname, "../src/db/seed-dev.js"), "utf8"),
  ...readdirSync(seedDevDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(resolve(seedDevDir, name), "utf8"))
].join("\n");
const rootPackageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../package.json"), "utf8"));
const serverPackageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));

describe("development seed data", () => {
  test("keeps realistic small invoice quantities with ample warehouse stock", () => {
    // Plenty of in-stock serials per product remain available to dispatch...
    expect(seedSource).toContain("MTK-INV1K-0010");
    expect(seedSource).toContain("MTK-SOL300-0010");
    expect(seedSource).toContain("MTK-BAT100-0010");
    expect(seedSource).toContain("MTK-ACCCHG-0010");
    // ...while invoices order realistic quantities (1-2 units), and the return
    // invoice has exactly its two dispatched serials.
    expect(seedSource).toContain("MTK-RET-0002");
    expect(seedSource).not.toContain("MTK-RET-0010");
    expect(seedSource).toContain("INV-001 lines: 2x Microtek Inverter 1KVA, 1x Microtek Solar Panel 300W");
    expect(seedSource).toContain("INV-002 lines: 2x Microtek Inverter 2KVA, 2x Microtek Solar Panel 500W, 1x Microtek Charge Controller");
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
