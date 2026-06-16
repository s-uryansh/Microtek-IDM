import { listExceptionsSchema } from "../models/exceptionSchemas.js";

const DISPATCH_CORRECTION_ERROR = "Dispatch exception can only be corrected after the invoice is dispatched";

export function createExceptionCorrectionService({ repositories }) {
  async function assertDispatchExceptionCorrectable(exception) {
    if (exception.contextType !== "DISPATCH") {
      return;
    }

    if (!exception.contextId || !repositories.dispatches?.findById) {
      throw Object.assign(new Error(DISPATCH_CORRECTION_ERROR), { status: 409 });
    }

    const dispatch = await repositories.dispatches.findById(exception.contextId);
    if (!dispatch?.invoiceId || !repositories.invoices?.findById) {
      throw Object.assign(new Error(DISPATCH_CORRECTION_ERROR), { status: 409 });
    }

    const invoice = await repositories.invoices.findById(dispatch.invoiceId);
    if (invoice?.status !== "DISPATCHED") {
      throw Object.assign(new Error(DISPATCH_CORRECTION_ERROR), { status: 409 });
    }
  }

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

      await assertDispatchExceptionCorrectable(exception);

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
