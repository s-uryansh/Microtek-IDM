import pg from "pg";

import { loadConfig } from "../config.js";
import { createLogger } from "../logger.js";
import { assertNonProduction, refreshAgeingSnapshot } from "./seedDev/constants.js";
import { seedReferences, seedRolePermissions } from "./seedDev/references.js";
import { seedDefaultAdmin, seedStaffUsers } from "./seedDev/users.js";
import { seedProductionAndHistory } from "./seedDev/serials.js";
import { seedDispatchDocs } from "./seedDev/dispatchDocs.js";
import { seedInvoicesAndDispatch } from "./seedDev/invoices.js";
import { seedReportsAndExceptions } from "./seedDev/reportsExceptions.js";
import { teardown } from "./seedDev/teardown.js";

async function seed(client) {
  await teardown(client);
  const refs = await seedReferences(client);
  await seedRolePermissions(client);
  await seedDefaultAdmin(client, refs);
  const staff = await seedStaffUsers(client, refs);
  const serials = await seedProductionAndHistory(client, refs);
  const dispatchDocs = await seedDispatchDocs(client, { ...refs, serials });
  const invoice = await seedInvoicesAndDispatch(client, { ...refs, serials });
  const reports = await seedReportsAndExceptions(client, { ...refs, serials });
  await refreshAgeingSnapshot(client);

  return {
    warehouses: refs.warehouses,
    products: refs.products,
    serials,
    cleanSapDispatchDocId: dispatchDocs.cleanDocId,
    dispatchInvoiceId: invoice.invoiceId,
    dispatchInvoiceLineId: invoice.invoiceLineId,
    inv1Line2Id: invoice.inv1Line2Id,
    batteryInvoiceId: invoice.batteryInvoiceId,
    batteryInvoiceLineId: invoice.batteryInvoiceLineId,
    returnInvoiceId: invoice.returnInvoiceId,
    returnInvoiceLineId: invoice.returnInvoiceLineId,
    returnDispatchId: invoice.returnDispatchId,
    invoice2Id: invoice.invoice2Id,
    inv2Line1Id: invoice.inv2Line1Id,
    inv2Line2Id: invoice.inv2Line2Id,
    inv2Line3Id: invoice.inv2Line3Id,
    invoice3Id: invoice.invoice3Id,
    inv3Line1Id: invoice.inv3Line1Id,
    inv3Line2Id: invoice.inv3Line2Id,
    inv3Line3Id: invoice.inv3Line3Id,
    invoice4Id: invoice.invoice4Id,
    inv4Line1Id: invoice.inv4Line1Id,
    inv4Line2Id: invoice.inv4Line2Id,
    inv4Line3Id: invoice.inv4Line3Id,
    invoice5Id: invoice.invoice5Id,
    inv5Line1Id: invoice.inv5Line1Id,
    inv5Line2Id: invoice.inv5Line2Id,
    inv5Line3Id: invoice.inv5Line3Id,
    invoice6Id: invoice.invoice6Id,
    inv6Line1Id: invoice.inv6Line1Id,
    inv6Line2Id: invoice.inv6Line2Id,
    inv6Line3Id: invoice.inv6Line3Id,
    openExceptionId: reports.openExceptionId,
    openException2Id: reports.openException2Id,
    admin: {
      username: "admin",
      password: "admin123"
    },
    staff
  };
}

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  assertNonProduction(config);

  const client = new pg.Client({ connectionString: config.databaseUrl });
  const command = process.argv[2] ?? "seed";
  await client.connect();

  try {
    await client.query("BEGIN");
    if (command === "teardown") {
      await teardown(client);
      await client.query("COMMIT");
      logger.info("Development seed data removed");
      return;
    }

    const summary = await seed(client);
    await client.query("COMMIT");
    logger.info({ summary }, "Development seed data ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
