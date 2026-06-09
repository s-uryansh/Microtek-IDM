import {
  productionBatchSchema,
  productionRecordSchema,
  qrOnlyRecordSchema
} from "../models/importSchemas.js";

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

function pickFirst(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return undefined;
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function parseQrCode(qrCode) {
  if (!qrCode) return {};

  try {
    const parsed = JSON.parse(qrCode);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const entries = {};
    const params = new URLSearchParams(qrCode.includes("?") ? qrCode.split("?").at(-1) : qrCode);
    for (const [key, value] of params.entries()) {
      entries[key] = value;
    }
    return entries;
  }
}

function normalizeRecord(input) {
  const qrData = qrOnlyRecordSchema.safeParse(input).success ? parseQrCode(input.qrCode) : {};
  const merged = { ...qrData, ...input };
  const sourceWarehouseId = toPositiveInteger(
    pickFirst(merged, ["sourceWarehouseId", "sourceWarehouse", "dispatchedFromWarehouseId", "fromWarehouseId"])
  );
  const destinationWarehouseId = toPositiveInteger(
    pickFirst(merged, ["destinationWarehouseId", "destinationWarehouse", "warehouseId", "toWarehouseId"])
  );

  return {
    serialNo: String(pickFirst(merged, ["serialNo", "serial", "serialNumber"]) ?? "").trim(),
    productCode: String(pickFirst(merged, ["productCode", "sku", "materialCode"]) ?? "").trim(),
    batchNo: pickFirst(merged, ["batchNo", "batch", "batchNumber"]),
    warehouseId: destinationWarehouseId,
    sourceWarehouseId,
    destinationWarehouseId,
    qrCode: input.qrCode,
    sourceInvoiceRef: pickFirst(merged, ["sourceInvoiceRef", "invoiceRef", "dispatchRef"])
  };
}

async function createReceiptException(repositories, { serialNo, ruleCode, grnId, userId }) {
  if (!repositories.exceptionsRepo) {
    return null;
  }

  const exception = await repositories.exceptionsRepo.createException({
    serialNo,
    ruleCode,
    contextType: "GRN",
    contextId: grnId,
    raisedBy: userId,
    createdBy: userId
  });

  return {
    exceptionId: exception.exceptionId,
    ruleCode: exception.ruleCode,
    status: exception.status ?? "OPEN"
  };
}

function invalidReceipt(ruleCode, message, exception = null) {
  return {
    valid: false,
    matchStatus: ruleCode,
    alert: { ruleCode, message },
    exception
  };
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
      const normalizedInput = {
        ...input,
        records: Array.isArray(input?.records) ? input.records.map(normalizeRecord) : input?.records
      };
      const parsed = productionBatchSchema.safeParse(normalizedInput);

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
          const dispatchLineCounters = new Map();

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
              currentWarehouseId: record.sourceWarehouseId ?? record.warehouseId,
              sourceWarehouseId: record.sourceWarehouseId,
              destinationWarehouseId: record.destinationWarehouseId ?? record.warehouseId,
              qrPayload: record.qrCode,
              currentStatus: record.destinationWarehouseId ? "IN_TRANSIT" : "PRODUCED",
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
            if (record.destinationWarehouseId) {
              await txRepositories.serials.appendSerialEvent({
                serialId: serial.serialId,
                eventType: "FACTORY_DISPATCH",
                warehouseId: record.destinationWarehouseId,
                referenceType: "IMPORT",
                referenceId: batch.batchId,
                batchId: batch.batchId,
                createdBy: parsed.data.receivedBy
              });

              if (txRepositories.sapDispatches?.upsertDoc && txRepositories.sapDispatches?.insertLine) {
                const dispatchExternalRef = record.sourceInvoiceRef || parsed.data.externalRef;
                const dispatchDoc = await txRepositories.sapDispatches.upsertDoc({
                  externalRef: dispatchExternalRef,
                  sourceWarehouseId: record.sourceWarehouseId,
                  destinationWarehouseId: record.destinationWarehouseId,
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
    },

    async scanReceipt({ serialNo, receivingWarehouseId, userId }) {
      const serial = await repositories.serials.findBySerialNo(serialNo);

      if (!serial) {
        const exception = await createReceiptException(repositories, {
          serialNo,
          ruleCode: "NOT_FOUND",
          grnId: null,
          userId
        });
        return invalidReceipt("NOT_FOUND", "Serial was not found in the SAP dispatch registry.", exception);
      }

      const dispatch = await repositories.sapDispatches?.findBySerialId
        ? await repositories.sapDispatches.findBySerialId(serial.serialId)
        : null;

      if (!dispatch) {
        const exception = await createReceiptException(repositories, {
          serialNo,
          ruleCode: "WRONG_SERIAL",
          grnId: null,
          userId
        });
        return invalidReceipt("WRONG_SERIAL", "Serial is not linked to an original SAP factory dispatch.", exception);
      }

      const runReceiptWrite = repositories.withTransaction
        ? (work) => repositories.withTransaction(work)
        : (work) => work(repositories);

      return runReceiptWrite(async (txRepositories) => {
        const grn = await txRepositories.grns.create({
          sapDispatchDocId: dispatch.sapDispatchDocId,
          receivingWarehouseId,
          createdBy: userId
        });

        if (String(dispatch.destinationWarehouseId) !== String(receivingWarehouseId)) {
          const exception = await createReceiptException(txRepositories, {
            serialNo,
            ruleCode: "WRONG_WAREHOUSE",
            grnId: grn.grnId,
            userId
          });
          await txRepositories.grns.updateStatus(grn.grnId, "EXCEPTION", userId);
          return {
            ...invalidReceipt(
              "WRONG_WAREHOUSE",
              "Scanned serial was dispatched by SAP to a different destination warehouse.",
              exception
            ),
            serialNo,
            sourceWarehouseId: dispatch.sourceWarehouseId,
            expectedWarehouseId: dispatch.destinationWarehouseId,
            receivedWarehouseId: receivingWarehouseId,
            sapDispatchDocId: dispatch.sapDispatchDocId
          };
        }

        const existingScan = await txRepositories.grns.findScanBySerial(grn.grnId, serial.serialId);

        if (existingScan) {
          const exception = await createReceiptException(txRepositories, {
            serialNo,
            ruleCode: "DUPLICATE_SCAN",
            grnId: grn.grnId,
            userId
          });
          return {
            ...invalidReceipt("DUPLICATE_SCAN", "Serial has already been received for this SAP dispatch.", exception),
            serialNo,
            sourceWarehouseId: dispatch.sourceWarehouseId,
            expectedWarehouseId: dispatch.destinationWarehouseId,
            receivedWarehouseId: receivingWarehouseId,
            sapDispatchDocId: dispatch.sapDispatchDocId
          };
        }

        await txRepositories.grns.insertScan({
          grnId: grn.grnId,
          serialId: serial.serialId,
          serialNo,
          matchStatus: "MATCHED",
          scannedBy: userId,
          createdBy: userId
        });
        await txRepositories.serials.updateReceipt(serial.serialId, receivingWarehouseId, userId);
        await txRepositories.serials.appendSerialEvent({
          serialId: serial.serialId,
          eventType: "GRN",
          warehouseId: receivingWarehouseId,
          referenceType: "GRN",
          referenceId: grn.grnId,
          createdBy: userId
        });
        await txRepositories.grns.updateStatus(grn.grnId, "IN_PROGRESS", userId);

        return {
          valid: true,
          matchStatus: "MATCHED",
          serialNo,
          serialId: serial.serialId,
          sourceWarehouseId: dispatch.sourceWarehouseId,
          expectedWarehouseId: dispatch.destinationWarehouseId,
          receivedWarehouseId: receivingWarehouseId,
          sapDispatchDocId: dispatch.sapDispatchDocId,
          grnId: grn.grnId,
          alert: null,
          exception: null
        };
      });
    },

    validateProductionRecord(record) {
      const parsed = productionRecordSchema.safeParse(normalizeRecord(record));

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
