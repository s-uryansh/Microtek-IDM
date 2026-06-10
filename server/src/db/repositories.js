import { createAgeingReportRepository } from "./ageingReportRepository.js";
import { createAuthRepository } from "../auth/authRepository.js";
import { createBatteryPreBillingRepository } from "./batteryPreBillingRepository.js";
import { createExceptionRepository } from "./exceptionRepository.js";
import { createDispatchRepository } from "./dispatchRepository.js";
import { createGrnRepository } from "./grnRepository.js";
import { createIntegrationBatchRepository } from "./integrationBatchRepository.js";
import { createInvoiceRepository } from "./invoiceRepository.js";
import { createLookupRepository } from "./lookupRepository.js";
import { createReconciliationRepository } from "./reconciliationRepository.js";
import { createSerialRepository } from "./serialRepository.js";
import { createSerialHistoryRepository } from "./serialHistoryRepository.js";
import { createSapDispatchRepository } from "./sapDispatchRepository.js";
import { createSrnRepository } from "./srnRepository.js";
import { createAdminRepository } from "../admin/adminRepository.js";

export function createRepositories(pool) {
  const repositories = {
    integrationBatches: createIntegrationBatchRepository(pool),
    lookups: createLookupRepository(pool),
    serials: createSerialRepository(pool),
    exceptionsRepo: createExceptionRepository(pool),
    invoices: createInvoiceRepository(pool),
    dispatches: createDispatchRepository(pool),
    grns: createGrnRepository(pool),
    sapDispatches: createSapDispatchRepository(pool),
    srns: createSrnRepository(pool),
    ageingReports: createAgeingReportRepository(pool),
    reconciliationReports: createReconciliationRepository(pool),
    serialHistories: createSerialHistoryRepository(pool),
    batteryPreBilling: createBatteryPreBillingRepository(pool),
    auth: createAuthRepository(pool),
    admin: createAdminRepository(pool)
  };

  if (typeof pool.connect === "function") {
    repositories.withTransaction = async (work) => {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const result = await work(createRepositories(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
  }

  return repositories;
}
