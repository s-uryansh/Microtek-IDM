import { z } from "zod";

import {
  paginationLimitSchema,
  paginationOffsetSchema,
  productIdSchema,
  warehouseIdSchema
} from "./commonSchemas.js";

export const ageingReportSchema = z.object({
  warehouseIds: z.array(warehouseIdSchema).min(1),
  productId: productIdSchema.optional(),
  limit: paginationLimitSchema.default(50),
  offset: paginationOffsetSchema.default(0)
});
