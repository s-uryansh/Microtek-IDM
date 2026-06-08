import { z } from "zod";

const serialPattern = /^[A-Z0-9][A-Z0-9._/-]{5,79}$/;

// Individual Record:
// {
  // "serialNo": "ABC123456",
  // "productCode": "SKU-INV-1",
  // "batchNo": "B-01",
  // "warehouseId": 3
// }
const productionRecordSchema = z.object({
  serialNo: z.string().trim().regex(serialPattern),
  productCode: z.string().trim().min(1).max(40),
  batchNo: z.string().trim().max(60).optional(),
  warehouseId: z.number().int().positive().optional(),
  sourceInvoiceRef: z.string().trim().max(60).optional()
});

// Representing the entire batch import payload:
// {
  // "externalRef": "SAP-PROD-001",
  // "source": "SAP",
  // "receivedBy": "integration_user",
  // "records": [...]
// }
const productionBatchSchema = z.object({
  externalRef: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1).max(60),
  sourceLabel: z.string().trim().max(60).optional(),
  receivedBy: z.string().trim().min(1).max(60),
  records: z.array(productionRecordSchema).min(1).max(10000)
});


function mapValidationError(error) {
  const issue = error.issues[0];
  return issue?.code === "invalid_string" ? "MALFORMED_SERIAL" : "INVALID_RECORD";
}

// a set is used to track seen serial number and avoid duplicates
function dedupeRecords(records) {
  const seen = new Set();
  const accepted = [];
  const duplicateRejections = [];

  records.forEach((record, index) => {
    if (seen.has(record.serialNo)) {
      duplicateRejections.push({
        index,
        serialNo: record.serialNo,
        reason: "DUPLICATE_SERIAL"
      });
      return;
    }

    seen.add(record.serialNo);
    accepted.push({ index, record });
  });

  return { accepted, duplicateRejections };
}


export function createImportService({ repositories }) {
  function mapBatchRow(batch) {
    return {
      batchId: batch.batchId,
      sourceLabel: batch.sourceLabel,
      importedAt: batch.finishedAt || batch.createdAt,
      importedCount: batch.recordCount,
      rejectedCount: 0,
      status: batch.status
    };
  }
  return {
    async importProductionBatch(input) {
      const parsed = productionBatchSchema.safeParse(input);

      if (!parsed.success) {
        throw new Error("Invalid production import payload");
      }

      const sourceLabel = parsed.data.sourceLabel || "unknown";

      const batchKey = {
        direction: "INBOUND",
        payloadType: "PRODUCTION",
        externalRef: parsed.data.externalRef
      };
      const existingBatch = await repositories.integrationBatches.findByKey(batchKey);

      if (existingBatch?.status === "PROCESSED" || existingBatch?.status === "REPLAYED") {
        return {
          status: "DUPLICATE_IGNORED",
          batchId: existingBatch.batchId,
          importedAt: new Date().toISOString(),
          sourceLabel,
          importedCount: 0,
          rejectedCount: 0,
          rejectedRows: []
        };
      }

      const batch = await repositories.integrationBatches.createPending({
        ...batchKey,
        sourceSystem: parsed.data.source,
        createdBy: parsed.data.receivedBy,
        sourceLabel
      });

      if (batch.status === "PROCESSED" || batch.status === "REPLAYED") {
        return {
          status: "DUPLICATE_IGNORED",
          batchId: batch.batchId,
          importedAt: new Date().toISOString(),
          sourceLabel,
          importedCount: 0,
          rejectedCount: 0,
          rejectedRows: []
        };
      }

      try {
        const result = await repositories.withTransaction(async (txRepositories) => {
          const { accepted, duplicateRejections } = dedupeRecords(parsed.data.records);
          const txRejections = [...duplicateRejections];
          let txImportedCount = 0;
          const txRejectedRows = [];

          for (const { index, record } of accepted) {
            const product = await txRepositories.serials.findProductByCode(record.productCode);

            if (!product) {
              txRejectedRows.push({
                index,
                serialNo: record.serialNo,
                reason: "UNKNOWN_PRODUCT"
              });
              txRejections.push({
                index,
                serialNo: record.serialNo,
                reason: "UNKNOWN_PRODUCT"
              });
              continue;
            }

            const serial = await txRepositories.serials.insertProductionSerial({
              serialNo: record.serialNo,
              productId: product.productId,
              batchNo: record.batchNo,
              currentWarehouseId: record.warehouseId,
              sourceInvoiceRef: record.sourceInvoiceRef,
              batchId: batch.batchId,
              createdBy: parsed.data.receivedBy
            });

            await txRepositories.serials.appendSerialEvent({
              serialId: serial.serialId,
              eventType: "PRODUCTION",
              warehouseId: serial.currentWarehouseId,
              referenceType: "IMPORT",
              referenceId: batch.batchId,
              batchId: batch.batchId,
              createdBy: parsed.data.receivedBy
            });
            txImportedCount += 1;
          }

          return {
            importedCount: txImportedCount,
            rejections: txRejections.sort((left, right) => left.index - right.index),
            rejectedRows: txRejectedRows.sort((left, right) => left.index - right.index)
          };
        });

        await repositories.integrationBatches.markProcessed(batch.batchId, result.importedCount);

        if (result.rejectedRows.length > 0) {
          await repositories.integrationBatches.storeRejections(batch.batchId, result.rejectedRows);
        }

        return {
          status: result.rejectedRows.length > 0 ? "PROCESSED_WITH_REJECTIONS" : "PROCESSED",
          batchId: batch.batchId,
          importedAt: new Date().toISOString(),
          sourceLabel,
          importedCount: result.importedCount,
          rejectedCount: result.rejectedRows.length,
          rejectedRows: result.rejectedRows
        };
      } catch (error) {
        await repositories.integrationBatches.markFailed(batch.batchId, error.message);
        throw error;
      }
    },

    validateProductionRecord(record) {
      const parsed = productionRecordSchema.safeParse(record);

      if (parsed.success) {
        return { valid: true, reason: null };
      }

      return { valid: false, reason: mapValidationError(parsed.error) };
    },

    async listBatches({ limit = 20, offset = 0, sourceLabel }) {
      const result = await repositories.integrationBatches.listBatches({ limit, offset, sourceLabel });

      return {
        batches: result.batches.map(mapBatchRow),
        total: result.total,
        limit: result.limit,
        offset: result.offset
      };
    },

    async getBatch(batchId) {
      const batch = await repositories.integrationBatches.getBatch(batchId);

      if (!batch) return null;

      return {
        ...mapBatchRow(batch),
        rejections: batch.rejections.map((r) => ({
          index: r.rowIndex,
          serialNo: r.serialNo,
          reason: r.reason
        }))
      };
    }
  };
}
