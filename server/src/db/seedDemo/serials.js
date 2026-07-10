import { D3, D4, D5, D10, D33, D45, D75, D100 } from "./constants.js";
import { insertSerial } from "./helpers.js";

// ─── 4. Serials ───────────────────────────────────────────────────────────────

export async function seedSerials(client, refs, batches) {
  const s = {};

  const p = refs.prod;
  const w = refs.wh;

  // B1: INV1K at CW-01, IN_STOCK, D5 (B0_30)
  for (let i = 101; i <= 112; i++) {
    const k = `INV1K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV1K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-1KVA"], "IN_STOCK", w["CW-01"], D5, batches.PROD_P1_001);
  }

  // B2: INV1K IN_TRANSIT (open GRN batch)
  for (let i = 201; i <= 208; i++) {
    const k = `INV1K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV1K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-1KVA"], "IN_TRANSIT", w["CW-01"], null, batches.FDISP_CW01);
  }

  // B3: BAT100 at CW-01, IN_STOCK, D4 (B0_30)
  for (let i = 101; i <= 112; i++) {
    const k = `BAT100_${i}`;
    s[k] = await insertSerial(client, `DEMO-BAT100-${String(i).padStart(4,"0")}`, p["MTK-BATTERY-100AH"], "IN_STOCK", w["CW-01"], D4, batches.PROD_P1_001);
  }

  // B4: BAT100 IN_TRANSIT
  for (let i = 201; i <= 206; i++) {
    const k = `BAT100_${i}`;
    s[k] = await insertSerial(client, `DEMO-BAT100-${String(i).padStart(4,"0")}`, p["MTK-BATTERY-100AH"], "IN_TRANSIT", w["CW-01"], null, batches.FDISP_CW01);
  }

  // B5: SOL300 at RW-01, IN_STOCK, D45 (B31_60)
  for (let i = 101; i <= 112; i++) {
    const k = `SOL300_${i}`;
    s[k] = await insertSerial(client, `DEMO-SOL300-${String(i).padStart(4,"0")}`, p["MTK-SOLAR-300W"], "IN_STOCK", w["RW-01"], D45, batches.PROD_P2_001);
  }

  // B6: INV2K at RW-02, IN_STOCK, D75 (B61_90) — 11 received, 1 short (IN_TRANSIT)
  for (let i = 101; i <= 111; i++) {
    const k = `INV2K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV2K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-2KVA"], "IN_STOCK", w["RW-02"], D75, batches.PROD_P2_001);
  }
  s["INV2K_112"] = await insertSerial(client, "DEMO-INV2K-0112", p["MTK-INVERTER-2KVA"], "IN_TRANSIT", w["RW-02"], null, batches.PROD_P2_001);

  // B7: BAT150 at RW-01, IN_STOCK, D100 (B91_PLUS)
  for (let i = 101; i <= 112; i++) {
    const k = `BAT150_${i}`;
    s[k] = await insertSerial(client, `DEMO-BAT150-${String(i).padStart(4,"0")}`, p["MTK-BATTERY-150AH"], "IN_STOCK", w["RW-01"], D100, batches.PROD_P1_002);
  }

  // B8: INV1K at RW-03, IN_STOCK, D3 (B0_30)
  for (let i = 301; i <= 308; i++) {
    const k = `INV1K_${i}`;
    s[k] = await insertSerial(client, `DEMO-INV1K-${String(i).padStart(4,"0")}`, p["MTK-INVERTER-1KVA"], "IN_STOCK", w["RW-03"], D3, batches.PROD_P1_002);
  }

  // B9: SOL500 at CW-02, IN_STOCK, D33 (B31_60)
  for (let i = 101; i <= 110; i++) {
    const k = `SOL500_${i}`;
    s[k] = await insertSerial(client, `DEMO-SOL500-${String(i).padStart(4,"0")}`, p["MTK-SOLAR-500W"], "IN_STOCK", w["CW-02"], D33, batches.FDISP_CW02);
  }

  // B10: CHGC at RW-04, IN_STOCK, D10 (B0_30)
  for (let i = 101; i <= 106; i++) {
    const k = `CHGC_${i}`;
    s[k] = await insertSerial(client, `DEMO-CHGC-${String(i).padStart(4,"0")}`, p["MTK-CHARGE-CONTROLLER"], "IN_STOCK", w["RW-04"], D10, batches.PROD_P2_002);
  }

  // Special serials
  s["SAL_0001"]     = await insertSerial(client, "DEMO-SRN-SAL-0001",   p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   null);
  s["SAL_0002"]     = await insertSerial(client, "DEMO-SRN-SAL-0002",   p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   null);
  s["DEF_0001"]     = await insertSerial(client, "DEMO-SRN-DEF-0001",   p["MTK-BATTERY-100AH"],  "IN_STOCK", w["CW-01"], D4,   null);
  s["WRONGWH_0001"] = await insertSerial(client, "DEMO-WRONGWH-0001",   p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["RW-02"], D75,  null);
  s["EXCESS_0001"]  = await insertSerial(client, "DEMO-EXCESS-0001",    p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   null);
  s["LIFECYCLE"]    = await insertSerial(client, "DEMO-LIFECYCLE-0001", p["MTK-INVERTER-1KVA"],  "IN_STOCK", w["CW-01"], D5,   batches.PROD_P1_001);

  return s;
}
