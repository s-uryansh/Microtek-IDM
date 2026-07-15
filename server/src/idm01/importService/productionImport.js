import { productionBatchEnvelopeSchema } from "../../models/importSchemas.js";

import { dedupeRecords } from "./dedupe.js";
import { validateProductionRecord } from "./recordNormalization.js";

export function createImportProductionBatch({ repositories, sapSourceWarehouseCode = "PLNT-01" }) {
  return async function importProductionBatch(input) {
    // Only batch-envelope problems (missing externalRef/source/receivedBy, or
    // a non-array/empty records list) fail the whole batch. Individual
    // malformed records are rejected per-row below.
    const parsed = productionBatchEnvelopeSchema.safeParse(input);

    if (!parsed.success) {
      throw new Error("Invalid production import payload");
    }

    const validCandidates = [];
    const malformedRejections = [];

    parsed.data.records.forEach((rawRecord, index) => {
      const validation = validateProductionRecord(rawRecord);

      if (!validation.valid) {
        malformedRejections.push({
          index,
          serialNo: validation.serialNo,
          reason: validation.reason
        });
        return;
      }

      validCandidates.push({ index, record: validation.record });
    });

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
        const { accepted, duplicateRejections } = dedupeRecords(validCandidates);
        const txRejections = [...malformedRejections, ...duplicateRejections];
        let txImportedCount = 0;
        const txRejectedRows = [...malformedRejections];
        const dispatchLineCounters = new Map();

        // Production always originates at the SAP plant. Resolve it once and
        // stamp it on every serial — the payload/CSV never supplies a source.
        // A missing plant is a configuration fault for the whole batch, so fail
        // loudly rather than importing serials with an unknown origin.
        const sourceWarehouse = await txRepositories.serials.findWarehouseByRef(sapSourceWarehouseCode);
        if (!sourceWarehouse) {
          throw new Error(`SAP source warehouse "${sapSourceWarehouseCode}" is not configured`);
        }
        const sourceWarehouseId = sourceWarehouse.warehouseId;

        // Destination refs (warehouse code/name/id) repeat across rows; resolve
        // each ref at most once per batch.
        const warehouseRefCache = new Map();
        async function resolveDestinationWarehouseId(ref) {
          if (warehouseRefCache.has(ref)) {
            return warehouseRefCache.get(ref);
          }
          const warehouse = await txRepositories.serials.findWarehouseByRef(ref);
          const resolvedId = warehouse ? warehouse.warehouseId : null;
          warehouseRefCache.set(ref, resolvedId);
          return resolvedId;
        }

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

          let destinationWarehouseId = null;
          if (record.destinationWarehouseRef) {
            destinationWarehouseId = await resolveDestinationWarehouseId(record.destinationWarehouseRef);
            if (!destinationWarehouseId) {
              txRejectedRows.push({
                index,
                serialNo: record.serialNo,
                reason: "UNKNOWN_WAREHOUSE"
              });
              txRejections.push({
                index,
                serialNo: record.serialNo,
                reason: "UNKNOWN_WAREHOUSE"
              });
              continue;
            }
          }

          const serial = await txRepositories.serials.insertProductionSerial({
            serialNo: record.serialNo,
            productId: product.productId,
            batchNo: record.batchNo,
            currentWarehouseId: sourceWarehouseId,
            sourceWarehouseId,
            destinationWarehouseId,
            qrPayload: record.qrCode,
            currentStatus: destinationWarehouseId ? "IN_TRANSIT" : "PRODUCED",
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
          if (destinationWarehouseId) {
            await txRepositories.serials.appendSerialEvent({
              serialId: serial.serialId,
              eventType: "FACTORY_DISPATCH",
              warehouseId: destinationWarehouseId,
              referenceType: "IMPORT",
              referenceId: batch.batchId,
              batchId: batch.batchId,
              createdBy: parsed.data.receivedBy
            });

            if (txRepositories.sapDispatches?.upsertDoc && txRepositories.sapDispatches?.insertLine) {
              const dispatchExternalRef = record.sourceInvoiceRef || parsed.data.externalRef;
              const dispatchDoc = await txRepositories.sapDispatches.upsertDoc({
                externalRef: dispatchExternalRef,
                sourceWarehouseId,
                destinationWarehouseId,
                batchId: batch.batchId,
                createdBy: parsed.data.receivedBy
              });
              const nextLineNo = (dispatchLineCounters.get(dispatchExternalRef) || 0) + 1;
              dispatchLineCounters.set(dispatchExternalRef, nextLineNo);
              await txRepositories.sapDispatches.insertLine({
                sapDispatchDocId: dispatchDoc.sapDispatchDocId,
                serialId: serial.serialId,
                productId: product.productId,
                lineNo: nextLineNo,
                createdBy: parsed.data.receivedBy
              });
            }
          }
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
  };
}
