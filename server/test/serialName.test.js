import { describe, expect, it } from "vitest";

import { baseSerialFrom, composeSerialNo, productPrefix } from "../src/utils/serialName.js";

describe("serialName composition (mirrors V027 trigger)", () => {
  it("uppercases and collapses non-alphanumerics into a single underscore", () => {
    expect(productPrefix("Inverter 1KVA")).toBe("INVERTER_1KVA");
    expect(productPrefix("Solar   300W")).toBe("SOLAR_300W");
    expect(productPrefix("Charge-Controller / MPPT")).toBe("CHARGE_CONTROLLER_MPPT");
    expect(productPrefix("  __Battery 100Ah__  ")).toBe("BATTERY_100AH");
  });

  it("composes serial_no as <PREFIX>_<base>", () => {
    expect(composeSerialNo("Inverter 1KVA", "SKU-110E")).toBe("INVERTER_1KVA_SKU-110E");
  });

  it("keeps the same base serial distinct across two different products", () => {
    const inverter = composeSerialNo("Inverter 1KVA", "SKU-100E");
    const controller = composeSerialNo("Charge Controller", "SKU-100E");
    expect(inverter).toBe("INVERTER_1KVA_SKU-100E");
    expect(controller).toBe("CHARGE_CONTROLLER_SKU-100E");
    expect(inverter).not.toBe(controller);
  });

  it("falls back to the raw base when the product name has no alphanumerics", () => {
    expect(composeSerialNo("!!!", "SKU-1")).toBe("SKU-1");
    expect(productPrefix("###")).toBe("");
  });

  it("recovers the base serial from a composed value", () => {
    expect(baseSerialFrom("INVERTER_1KVA_SKU-110E", "Inverter 1KVA")).toBe("SKU-110E");
    // Not prefixed with this product's prefix -> returned unchanged.
    expect(baseSerialFrom("SKU-110E", "Inverter 1KVA")).toBe("SKU-110E");
  });

  it("round-trips compose -> baseSerialFrom", () => {
    const base = "ABC-999/X";
    const composed = composeSerialNo("Battery 150Ah", base);
    expect(baseSerialFrom(composed, "Battery 150Ah")).toBe(base);
  });
});
