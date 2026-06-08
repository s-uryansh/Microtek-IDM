function requiredQuantity(lines) {
  return lines.reduce((total, line) => total + Number(line.quantity), 0);
}

function findLine(dispatch, invoiceLineId) {
  return dispatch.lines.find((line) => String(line.invoiceLineId) === String(invoiceLineId)) ?? null;
}

function invalidScan(ruleCode, message) {
  return {
    valid: false,
    serial: null,
    alert: {
      ruleCode,
      message
    },
    exception: null
  };
}

async function recordDispatchException(repositories, { serialNo, ruleCode, dispatchId, userId }) {
  if (!repositories.exceptionsRepo) {
    return null;
  }

  const exception = await repositories.exceptionsRepo.createException({
    serialNo,
    ruleCode,
    contextType: "DISPATCH",
    contextId: dispatchId,
    raisedBy: userId,
    createdBy: userId
  });

  return {
    exceptionId: exception.exceptionId,
    ruleCode: exception.ruleCode,
    status: exception.status ?? "OPEN"
  };
}

function invalidScanWithException(ruleCode, message, exception) {
  return {
    ...invalidScan(ruleCode, message),
    exception
  };
}

function formatCompletedSerialRow(row) {
  return {
    serialNo: row.serialNo,
    productCode: row.productCode,
    warehouseId: Number(row.warehouseId)
  };
}

export function createDispatchService({ repositories, fulfilmentStatusService }) {
  return {
    async getDispatchWarehouseId(dispatchId) {
      return repositories.dispatches.getWarehouseId(dispatchId);
    },

    async startDispatch({ invoiceId, warehouseId, userId }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      if (!invoice || String(invoice.warehouseId) !== String(warehouseId)) {
        throw Object.assign(new Error("Invoice not found"), { status: 404 });
      }

      return repositories.dispatches.createDispatch({
        invoiceId,
        warehouseId,
        createdBy: userId
      });
    },

    async scanSerial({ dispatchId, invoiceLineId, serialNo, userId }) {
      const dispatch = await repositories.dispatches.findById(dispatchId);

      if (!dispatch) {
        throw new Error("Dispatch not found");
      }

      const line = findLine(dispatch, invoiceLineId);

      if (!line) {
        throw new Error("Invoice line not found");
      }

      const validationResult = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "DISPATCH",
        contextId: dispatchId,
        warehouseId: dispatch.warehouseId,
        expectedProductId: line.productId,
        userId
      });

      if (!validationResult.valid) {
        return validationResult;
      }

      return repositories.withTransaction(async (txRepositories) => {
        const lockedDispatch = await txRepositories.dispatches.lockById(dispatchId);

        if (!lockedDispatch) {
          throw new Error("Dispatch not found");
        }

        const lockedLine = findLine(lockedDispatch, invoiceLineId);

        if (!lockedLine) {
          throw new Error("Invoice line not found");
        }

        const lineScanCount = await txRepositories.dispatches.countScansForLine(dispatchId, invoiceLineId);

        if (lineScanCount >= lockedLine.quantity) {
          const exception = await recordDispatchException(txRepositories, {
            serialNo,
            ruleCode: "ALREADY_DISPATCHED",
            dispatchId,
            userId
          });
          return invalidScanWithException("ALREADY_DISPATCHED", "Invoice line has already been fully scanned.", exception);
        }

        const serialUpdated = await txRepositories.serials.updateStatusIfCurrent(
          validationResult.serial.serialId,
          "IN_STOCK",
          "DISPATCHED",
          userId
        );

        if (!serialUpdated) {
          const exception = await recordDispatchException(txRepositories, {
            serialNo,
            ruleCode: "ALREADY_DISPATCHED",
            dispatchId,
            userId
          });
          return invalidScanWithException("ALREADY_DISPATCHED", "Serial has already been dispatched.", exception);
        }

        const scan = await txRepositories.dispatches.insertScan({
          dispatchId,
          invoiceLineId,
          serialId: validationResult.serial.serialId,
          scannedBy: userId,
          createdBy: userId
        });

        if (!scan) {
          throw new Error("Duplicate dispatch scan");
        }

        await txRepositories.serials.appendSerialEvent({
          serialId: validationResult.serial.serialId,
          eventType: "CUSTOMER_DISPATCH",
          warehouseId: lockedDispatch.warehouseId,
          referenceType: "DISPATCH",
          referenceId: dispatchId,
          createdBy: userId
        });

        const scannedQuantity = await txRepositories.dispatches.countScans(dispatchId);
        const status = fulfilmentStatusService.calculateStatus({
          requiredQuantity: requiredQuantity(lockedDispatch.lines),
          scannedQuantity
        });

        await txRepositories.dispatches.updateStatus(dispatchId, status);
        await txRepositories.invoices.updateStatus(lockedDispatch.invoiceId, status);

        return {
          valid: true,
          status,
          scan: {
            dispatchScanId: scan.dispatchScanId,
            dispatchId,
            invoiceLineId,
            serialId: validationResult.serial.serialId,
            serialNo: validationResult.serial.serialNo
          },
          alert: null,
          exception: null
        };
      }).catch((error) => {
        if (error.message === "Duplicate dispatch scan") {
          return recordDispatchException(repositories, {
            serialNo,
            ruleCode: "ALREADY_DISPATCHED",
            dispatchId,
            userId
          }).then((exception) =>
            invalidScanWithException("ALREADY_DISPATCHED", "Serial has already been scanned for dispatch.", exception)
          );
        }

        throw error;
      });
    },

    async completeDispatch({ dispatchId }) {
      return repositories.withTransaction(async (txRepositories) => {
        const dispatch = await txRepositories.dispatches.lockById(dispatchId);

        if (!dispatch) {
          throw new Error("Dispatch not found");
        }

        const scannedQuantity = await txRepositories.dispatches.countScans(dispatchId);
        const completion = fulfilmentStatusService.canCompleteDispatch({
          requiredQuantity: requiredQuantity(dispatch.lines),
          scannedQuantity
        });

        await txRepositories.dispatches.updateStatus(dispatchId, completion.status);
        await txRepositories.invoices.updateStatus(dispatch.invoiceId, completion.status);

        if (!completion.allowed) {
          return {
            completed: false,
            status: completion.status,
            reason: completion.reason
          };
        }

        return {
          completed: true,
          status: completion.status,
          reason: null
        };
      });
    },

    async getConfirmedSerials(dispatchId) {
      const dispatch = await repositories.dispatches.findConfirmedSerials(dispatchId);

      if (!dispatch) {
        throw Object.assign(new Error("Dispatch not found"), { status: 404 });
      }

      if (dispatch.status !== "DISPATCHED") {
        throw Object.assign(new Error("Dispatch not yet completed"), { status: 409 });
      }

      const serials = await repositories.dispatches.findSerialsForDispatch(dispatchId);

      return {
        dispatchId: Number(dispatch.dispatchId),
        invoiceId: Number(dispatch.invoiceId),
        completedAt: dispatch.completedAt ? dispatch.completedAt.toISOString() : null,
        serials: serials.map(formatCompletedSerialRow)
      };
    },

    async getPendingSapSyncDispatches() {
      // SAP outbound adapter will call this, POST confirmed serials
      // to SAP, then PATCH /api/idm-05/dispatches/:id/sap-synced to mark complete
      return repositories.dispatches.findPendingSapSyncDispatches(100);
    },

    async markSapSynced(dispatchId, sapBatchId) {
      // Called by SAP outbound adapter after successful SAP posting
      return repositories.dispatches.markSapSynced(dispatchId, sapBatchId);
    }
  };
}
