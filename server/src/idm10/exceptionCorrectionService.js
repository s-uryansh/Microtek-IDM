export function createExceptionCorrectionService({ repositories }) {
  return {
    async listExceptions({ status, contextType, warehouseIds, page = 1, pageSize = 50 }) {
      const safeLimit = Math.min(pageSize, 200);
      const offset = (page - 1) * safeLimit;

      const { rows, total } = await repositories.exceptionsRepo.findAll({
        status: status || null,
        contextType: contextType || null,
        warehouseIds: warehouseIds || null,
        limit: safeLimit,
        offset
      });

      return {
        exceptions: rows,
        total,
        page,
        pageSize: safeLimit
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
