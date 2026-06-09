import { z } from "zod";

import {
  paginationLimitSchema,
  paginationOffsetSchema,
  warehouseIdSchema
} from "./commonSchemas.js";

export const listExceptionsSchema = z.object({
  status: z.string().nullable().optional(),
  contextType: z.string().nullable().optional(),
  warehouseIds: z.array(warehouseIdSchema).nullable().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  limit: paginationLimitSchema.optional(),
  offset: paginationOffsetSchema.optional()
});
