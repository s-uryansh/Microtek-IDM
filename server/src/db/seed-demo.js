/**
 * Comprehensive demo seed covering all 10 IDM modules.
 * Uses created_by = "DEMO" so teardown is isolated from the dev seed.
 *
 * Run:      node src/db/seed-demo.js
 * Teardown: node src/db/seed-demo.js teardown
 */

import pg from "pg";
import { loadConfig } from "../config.js";
import { teardown } from "./seedDemo/teardown.js";
import { loadRefs, seedWarehouses, seedUsers } from "./seedDemo/foundation.js";
import { seedBatches } from "./seedDemo/batches.js";
import { seedSerials } from "./seedDemo/serials.js";
import { seedSapDocs, seedGrns } from "./seedDemo/receiving.js";
import { seedInvoicesAndDispatches } from "./seedDemo/invoicesDispatch.js";
import { seedSrns } from "./seedDemo/srns.js";
import { seedExceptions } from "./seedDemo/exceptions.js";
import { seedLifecycleEvents, seedReconciliation, refreshAgeingMV } from "./seedDemo/reports.js";

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();

  const command = process.argv[2];

  try {
    await client.query("BEGIN");

    if (command === "teardown") {
      await teardown(client);
      await client.query("COMMIT");
      return;
    }

    // ── seed ──
    await seedWarehouses(client);
    const refs = await loadRefs(client);

    await seedUsers(client, refs);
    const batches = await seedBatches(client);
    const serials = await seedSerials(client, refs, batches);
    const docs    = await seedSapDocs(client, refs, serials, batches);
    const grns    = await seedGrns(client, refs, serials, docs);
    const dispData = await seedInvoicesAndDispatches(client, refs, serials);
    const srnIds  = await seedSrns(client, refs, serials, dispData);
    await seedExceptions(client, refs, serials, grns, dispData.disp, srnIds, batches);
    await seedLifecycleEvents(client, refs, serials, batches, grns, dispData, srnIds);
    await seedReconciliation(client, refs);

    await client.query("COMMIT");

    // Refresh outside transaction (cannot REFRESH MATERIALIZED VIEW in a txn with concurrent reads)
    await refreshAgeingMV(client);

    console.log(JSON.stringify({
      msg: "Demo seed data ready",
      warehouses: 9,
      newUsers: 4,
      integrationBatches: 8,
      serials: "~130 DEMO-prefixed",
      sapDispatchDocs: 5,
      grns: "4 CLOSED + 1 IN_PROGRESS",
      invoices: 9,
      dispatches: "3 DISPATCHED + 2 IN_PROGRESS + 2 PENDING",
      srns: "3 CLOSED/IN_PROGRESS",
      exceptions: "16 total (6 OPEN, 5 CORRECTED, 5 DISMISSED)",
      ageingBuckets: "B0_30 / B31_60 / B61_90 / B91_PLUS all populated",
      lifecycleSerial: "DEMO-LIFECYCLE-0001 — 7 events",
    }, null, 2));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Demo seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
