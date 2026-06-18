import { parse } from "csv-parse/sync";

import {
  productionBatchEnvelopeSchema,
  productionRecordSchema,
  qrOnlyRecordSchema
} from "../models/importSchemas.js";

// Manual CSV uploads are bounded well under the JSON body limit (app.js caps the
// request at 1mb). Larger feeds should use the signed SAP webhook on /production.
const MAX_CSV_IMPORT_ROWS = 5000;

// Parse a manually-uploaded CSV into the same row objects importProductionBatch
// already accepts. Header names map straight onto record fields, and
// normalizeRecord handles the column aliases (serial/serialNo, sku/productCode,
// etc.), so no per-column mapping is needed here.
function parseProductionCsv(csvContent) {
  if (typeof csvContent !== "string" || !csvContent.trim()) {
    throw new Error("CSV content is required");
  }

  let rows;
  try {
    rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true
    });
  } catch (error) {
    throw new Error(`Invalid CSV: ${error.message}`);
  }

  if (rows.length === 0) {
    throw new Error("CSV has no data rows");
  }

  if (rows.length > MAX_CSV_IMPORT_ROWS) {
    throw new Error(`CSV exceeds the ${MAX_CSV_IMPORT_ROWS}-row limit; use the SAP production API for larger batches`);
  }

  return rows;
}

function mapValidationError(error) {
  const issue = error.issues[0];
  return issue?.code === "invalid_string" || issue?.code === "invalid_format"
    ? "MALFORMED_SERIAL"
    : "INVALID_RECORD";
}

function dedupeRecords(candidates) {
  const seen = new Set();
  const accepted = [];
  const duplicateRejections = [];

  for (const { index, record } of candidates) {
    if (seen.has(record.serialNo)) {
      duplicateRejections.push({
        index,
        serialNo: record.serialNo,
        reason: "DUPLICATE_SERIAL"
      });
      continue;
    }

    seen.add(record.serialNo);
    accepted.push({ index, record });
  }

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

function normalizeRecord(rawInput) {
  const input = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) ? rawInput : {};
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

// Per-row validation shared by importProductionBatch (which needs the parsed
// record to carry forward) and the public validateProductionRecord method.
function validateProductionRecord(rawRecord) {
  const normalized = normalizeRecord(rawRecord);
  const parsed = productionRecordSchema.safeParse(normalized);

  if (parsed.success) {
    return { valid: true, reason: null, serialNo: parsed.data.serialNo, record: parsed.data };
  }

  return {
    valid: false,
    reason: mapValidationError(parsed.error),
    serialNo: normalized.serialNo || null,
    record: null
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
  const service = {
    async importProductionBatch(input) {
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

      // Layer 1 (fast path): a serial that is already IN_STOCK has been received
      // before. The serial row is already loaded, so this costs no extra query
      // and stops a cross-session duplicate before any GRN is created. The DB
      // unique index on grn_scan is the race-safe backstop (see insertScan below).
      if (serial.currentStatus === "IN_STOCK") {
        const exception = await createReceiptException(repositories, {
          serialNo,
          ruleCode: "DUPLICATE_SCAN",
          grnId: null,
          userId
        });
        return {
          ...invalidReceipt("DUPLICATE_SCAN", "Serial has already been received into stock.", exception),
          serialNo
        };
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

      if (dispatch.ambiguous) {
        return {
          ...invalidReceipt(
            "AMBIGUOUS_DISPATCH",
            "Serial maps to multiple SAP dispatch documents; ownership must be resolved before receipt.",
            null
          ),
          serialNo,
          candidateDispatchDocIds: dispatch.candidateDispatchDocIds
        };
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

        // Layer 2 (race-safe backstop): insertScan uses ON CONFLICT DO NOTHING,
        // so under a concurrent/retried receipt the DB unique index on grn_scan
        // rejects the second insert and returns no row. Treat that as a duplicate
        // rather than falling through to a false MATCHED.
        const insertedScan = await txRepositories.grns.insertScan({
          grnId: grn.grnId,
          serialId: serial.serialId,
          serialNo,
          matchStatus: "MATCHED",
          scannedBy: userId,
          createdBy: userId
        });

        if (!insertedScan) {
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
      const { valid, reason } = validateProductionRecord(record);
      return { valid, reason };
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
