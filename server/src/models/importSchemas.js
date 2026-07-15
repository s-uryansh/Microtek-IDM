import { z } from "zod";

import { serialNoSchema, userIdSchema } from "./commonSchemas.js";

// Canonical production row after normalization. Rows are serial-level (one
// physical unit each). The source warehouse is NOT part of the row — production
// always originates at the SAP plant, which the service stamps server-side. The
// optional destination is carried as a free-form reference (warehouse code or
// name, e.g. "RW-01") that the service resolves to an id; numeric ids arriving
// from the SAP JSON/QR path are normalized into this same string reference.
export const productionRecordSchema = z.object({
  serialNo: serialNoSchema,
  productCode: z.string().trim().min(1).max(40),
  batchNo: z.string().trim().max(60).optional(),
  destinationWarehouseRef: z.string().trim().min(1).max(120).optional(),
  qrCode: z.string().trim().max(2000).optional(),
  sourceInvoiceRef: z.string().trim().max(60).optional()
});

export const qrOnlyRecordSchema = z.object({
  qrCode: z.string().trim().min(1).max(2000)
});

export const productionBatchSchema = z.object({
  externalRef: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1).max(60),
  sourceLabel: z.string().trim().max(60).optional(),
  receivedBy: userIdSchema,
  records: z.array(productionRecordSchema).min(1).max(10000)
});

// Validates only the batch envelope (the fields that must be sound for the
// whole batch to be processable) while leaving per-record content to be
// validated row-by-row. A single malformed record must reject only that row,
// not the entire batch.
export const productionBatchEnvelopeSchema = z.object({
  externalRef: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1).max(60),
  sourceLabel: z.string().trim().max(60).optional(),
  receivedBy: userIdSchema,
  records: z.array(z.unknown()).min(1).max(10000)
});
