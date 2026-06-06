function alert(ruleCode, message) {
  return { ruleCode, message };
}

async function createException(repositories, { serialNo, ruleCode, grnId, userId }) {
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

function exceptionResult({ matchStatus, ruleCode, message, exception }) {
  return {
    valid: false,
    matchStatus,
    alert: alert(ruleCode, message),
    exception
  };
}

export function createGrnService({ repositories }) {
  return {
    async startGrn({ sapDispatchDocId, receivingWarehouseId, userId }) {
      return repositories.grns.create({
        sapDispatchDocId,
        receivingWarehouseId,
        createdBy: userId
      });
    },

    async getGrn({ grnId }) {
      const grn = await repositories.grns.findById(grnId);

      if (!grn) {
        throw new Error("GRN not found");
      }

      return grn;
    },

    async getGrnWarehouseId(grnId) {
      return repositories.grns.getWarehouseId(grnId);
    },

    async scanSerial({ grnId, serialNo, userId }) {
      const grn = await repositories.grns.findById(grnId);

      if (!grn) {
        throw new Error("GRN not found");
      }

      const validation = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "GRN",
        contextId: grnId,
        userId
      });

      if (!validation.valid) {
        return validation;
      }

      return repositories.withTransaction(async (txRepositories) => {
        const lockedGrn = await txRepositories.grns.lockById(grnId);

        if (!lockedGrn) {
          throw new Error("GRN not found");
        }

        const existingScan = await txRepositories.grns.findScanBySerial(grnId, validation.serial.serialId);

        if (existingScan) {
          const exception = await createException(txRepositories, {
            serialNo,
            ruleCode: "DUPLICATE_SCAN",
            grnId,
            userId
          });
          return exceptionResult({
            matchStatus: "DUPLICATE_SCAN",
            ruleCode: "DUPLICATE_SCAN",
            message: "Serial has already been scanned for this GRN.",
            exception
          });
        }

        const expectedLine = await txRepositories.grns.findExpectedLine(grnId, validation.serial.serialId);

        if (!expectedLine) {
          const otherDispatchLine = txRepositories.grns.findSerialInOtherDispatch
            ? await txRepositories.grns.findSerialInOtherDispatch(grnId, validation.serial.serialId)
            : null;
          const matchStatus = otherDispatchLine ? "WRONG_SERIAL" : "EXCESS";
          const ruleCode = otherDispatchLine ? "WRONG_SERIAL" : "EXCESS";
          const message = otherDispatchLine
            ? "Serial belongs to another sender dispatch document or destination."
            : "Serial is not expected on this sender dispatch document.";
          const exception = await createException(txRepositories, {
            serialNo,
            ruleCode,
            grnId,
            userId
          });
          await txRepositories.grns.insertScan({
            grnId,
            serialId: validation.serial.serialId,
            serialNo,
            matchStatus,
            scannedBy: userId,
            createdBy: userId
          });
          await txRepositories.grns.updateStatus(grnId, "EXCEPTION", userId);
          return exceptionResult({
            matchStatus,
            ruleCode,
            message,
            exception
          });
        }

        await txRepositories.grns.insertScan({
          grnId,
          serialId: validation.serial.serialId,
          serialNo,
          matchStatus: "MATCHED",
          scannedBy: userId,
          createdBy: userId
        });
        await txRepositories.serials.updateReceipt(validation.serial.serialId, lockedGrn.receivingWarehouseId, userId);
        await txRepositories.serials.appendSerialEvent({
          serialId: validation.serial.serialId,
          eventType: "GRN",
          warehouseId: lockedGrn.receivingWarehouseId,
          referenceType: "GRN",
          referenceId: grnId,
          createdBy: userId
        });
        await txRepositories.grns.updateStatus(grnId, "IN_PROGRESS", userId);

        return {
          valid: true,
          matchStatus: "MATCHED",
          serial: validation.serial,
          alert: null,
          exception: null
        };
      });
    },

    async completeGrn({ grnId, userId }) {
      return repositories.withTransaction(async (txRepositories) => {
        const grn = await txRepositories.grns.lockById(grnId);

        if (!grn) {
          throw new Error("GRN not found");
        }

        const missingLines = await txRepositories.grns.findMissingExpectedLines(grnId);

        for (const line of missingLines) {
          await txRepositories.grns.markShort({
            grnId,
            serialId: line.serialId,
            serialNo: line.serialNo,
            createdBy: userId
          });
          await createException(txRepositories, {
            serialNo: line.serialNo,
            ruleCode: "SHORT",
            grnId,
            userId
          });
        }

        const status = missingLines.length > 0 ? "EXCEPTION" : "MATCHED";
        await txRepositories.grns.updateStatus(grnId, status, userId);

        return {
          grnId,
          status,
          summary: {
            short: missingLines.length
          }
        };
      });
    }
  };
}
