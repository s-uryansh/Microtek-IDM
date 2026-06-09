import { z } from "zod";

import {
  productIdSchema,
  serialNoSchema,
  userIdSchema,
  warehouseIdSchema
} from "./commonSchemas.js";

export const validationContextTypeSchema = z.enum(["FOUNDATION", "IMPORT", "GRN", "DISPATCH", "SRN", "BATTERY"]);

export const validationRequestSchema = z.object({
  serialNo: serialNoSchema,
  contextType: validationContextTypeSchema,
  contextId: z.number().int().positive().optional(),
  warehouseId: warehouseIdSchema.optional(),
  expectedProductId: productIdSchema.optional(),
  userId: userIdSchema
});
