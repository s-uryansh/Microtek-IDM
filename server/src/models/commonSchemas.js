import { z } from "zod";

export const serialPattern = /^[A-Z0-9][A-Z0-9._/-]{5,79}$/;

export const serialNoSchema = z.string().trim().regex(serialPattern);
export const positiveIntegerSchema = z.number().int().positive();
export const userIdSchema = z.string().trim().min(1).max(60);
export const warehouseIdSchema = positiveIntegerSchema;
export const productIdSchema = positiveIntegerSchema;
export const paginationLimitSchema = z.number().int().nonnegative().max(200);
export const paginationOffsetSchema = z.number().int().nonnegative();
