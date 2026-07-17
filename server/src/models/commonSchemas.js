import { z } from "zod";

// Accepts both a raw scanned base serial ("SKU-110E") and the stored composed
// serial ("INVERTER_1KVA_SKU-110E", see V027) — underscore is explicit and the
// upper bound matches serial_master.serial_no VARCHAR(255).
export const serialPattern = /^[A-Z0-9][A-Z0-9_./-]{5,254}$/;

export const serialNoSchema = z.string().trim().regex(serialPattern);
export const positiveIntegerSchema = z.number().int().positive();
export const userIdSchema = z.string().trim().min(1).max(60);
export const warehouseIdSchema = positiveIntegerSchema;
export const productIdSchema = positiveIntegerSchema;
export const paginationLimitSchema = z.number().int().nonnegative().max(200);
export const paginationOffsetSchema = z.number().int().nonnegative();
