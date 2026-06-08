import { z } from "zod";

const listExceptionsSchema = z.object({
  status: z.string().nullable().optional(),
  contextType: z.string().nullable().optional(),
  warehouseIds: z.array(z.number().int().positive()).nullable().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  limit: z.number().int().nonnegative().max(200).optional(),
  offset: z.number().int().nonnegative().optional()
});

export function createExceptionCorrectionService({ repositories }) {
  return {
    async listExceptions(input = {}) {
      const parsed = listExceptionsSchema.parse(input);
      const safeLimit = parsed.limit ?? Math.min(parsed.pageSize ?? 50, 200);
      const offset = parsed.offset ?? ((parsed.page ?? 1) - 1) * safeLimit;
      const page = parsed.page ?? Math.floor(offset / safeLimit) + 1;

      const { rows, total } = await repositories.exceptionsRepo.findAll({
        status: parsed.status || null,
        contextType: parsed.contextType || null,
        warehouseIds: parsed.warehouseIds || null,
        limit: safeLimit,
        offset
      });

      return {
        data: rows,
        exceptions: rows,
        total,
        page,
        pageSize: safeLimit,
        pagination: {
          limit: safeLimit,
          offset,
          total
        }
      };
    },

    async getException({ exceptionId }) {
      return repositories.exceptionsRepo.findById(exceptionId);
    },

    async correctException({ exceptionId, correctionReason, userId }) {
      if (!correctionReason || correctionReason.trim().length === 0) {
        throw new Error("Correction reason is required");
      }

      const exception = await repositories.exceptionsRepo.findById(exceptionId);

      if (!exception) {
        throw new Error("Exception not found");
      }

      if (exception.status !== "OPEN") {
        throw new Error("Exception is already resolved");
      }

      return repositories.withTransaction(async (txRepositories) => {
        const updated = await txRepositories.exceptionsRepo.correctException({
          exceptionId,
          correctionReason: correctionReason.trim(),
          correctedBy: userId,
          correctionTxnRef: null
        });

        if (!updated) {
          throw new Error("Exception was already corrected by another user");
        }

        if (exception.serialNo) {
          const serial = await txRepositories.serials.findBySerialNo(exception.serialNo);

          if (serial) {
            await txRepositories.serials.appendSerialEvent({
              serialId: serial.serialId,
              eventType: "CORRECTION",
              warehouseId: null,
              referenceType: "EXCEPTION",
              referenceId: exceptionId,
              createdBy: userId
            });
          }
        }

        return updated;
      });
    }
  };
}
