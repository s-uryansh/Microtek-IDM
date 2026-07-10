import { getBatch, listBatches } from "./importService/batchQueries.js";
import { parseProductionCsv } from "./importService/csvParser.js";
import { createImportProductionBatch } from "./importService/productionImport.js";
import { validateProductionRecord } from "./importService/recordNormalization.js";
import { createScanReceipt } from "./importService/receiptScan.js";

export function createImportService({ repositories }) {
  const importProductionBatch = createImportProductionBatch({ repositories });
  const scanReceipt = createScanReceipt({ repositories });

  const service = {
    importProductionBatch,

    scanReceipt,

    validateProductionRecord(record) {
      const { valid, reason } = validateProductionRecord(record);
      return { valid, reason };
    },

    async listBatches({ limit = 20, offset = 0, sourceLabel }) {
      return listBatches(repositories, { limit, offset, sourceLabel });
    },

    async getBatch(batchId) {
      return getBatch(repositories, batchId);
    },

    // Manual CSV import path: a permitted user uploads a CSV instead of SAP
    // POSTing the JSON webhook. Parsing is the only difference — the parsed rows
    // flow through the exact same importProductionBatch pipeline (envelope
    // validation, per-row validation, dedupe, dispatch-doc writes, idempotency).
    async importProductionBatchCsv({ csvContent, externalRef, source, sourceLabel, receivedBy }) {
      const records = parseProductionCsv(csvContent);

      return service.importProductionBatch({
        externalRef,
        source,
        sourceLabel,
        receivedBy,
        records
      });
    }
  };

  return service;
}
