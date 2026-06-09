function requiredQuantity(lines) {
  return lines.reduce((total, line) => total + Number(line.quantity), 0);
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function productIdsForInvoice(invoice) {
  return [...new Set(invoice.lines.map((line) => Number(line.productId)))];
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
  async function findAvailableLine(txRepositories, dispatch, serialProductId) {
    const candidateLines = dispatch.lines.filter((line) => String(line.productId) === String(serialProductId));

    for (const line of candidateLines) {
      const lineScanCount = await txRepositories.dispatches.countScansForLine(dispatch.dispatchId, line.invoiceLineId);
      if (lineScanCount < line.quantity) {
        return { line, lineScanCount };
      }
    }

    return { line: null, lineScanCount: 0 };
  }

  function invoiceStatusFor({ invoiceRequiredQuantity, scannedQuantity }) {
    return scannedQuantity >= invoiceRequiredQuantity ? "DISPATCHED" : "IN_PROGRESS";
  }

  return {
    async getDispatchWarehouseId(dispatchId) {
      return repositories.dispatches.getWarehouseId(dispatchId);
    },

    async getAvailability({ invoiceId, warehouseId }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      if (!invoice || String(invoice.warehouseId) !== String(warehouseId)) {
        throw Object.assign(new Error("Invoice not found"), { status: 404 });
      }

      const existingDispatch = await repositories.dispatches.findByInvoiceId(invoiceId);
      const alreadyScannedQuantity = existingDispatch
        ? await repositories.dispatches.countScans(existingDispatch.dispatchId)
        : 0;
      const invoiceRequiredQuantity = requiredQuantity(invoice.lines);
      const currentWarehouseStockQty = repositories.serials.countAvailableStock
        ? await repositories.serials.countAvailableStock({
            warehouseId,
            productIds: productIdsForInvoice(invoice)
          })
        : 0;

      return {
        invoiceId,
        warehouseId,
        invoiceRequiredQuantity,
        alreadyScannedQuantity,
        remainingInvoiceQuantity: Math.max(invoiceRequiredQuantity - alreadyScannedQuantity, 0),
        currentWarehouseStockQty
      };
    },

    async startDispatch({ invoiceId, warehouseId, dispatchQuantity, userId }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      if (!invoice || String(invoice.warehouseId) !== String(warehouseId)) {
        throw Object.assign(new Error("Invoice not found"), { status: 404 });
      }

      const totalRequiredQuantity = requiredQuantity(invoice.lines);
      const existingDispatch = await repositories.dispatches.findByInvoiceId(invoiceId);
      const alreadyScannedQuantity = existingDispatch
        ? await repositories.dispatches.countScans(existingDispatch.dispatchId)
        : 0;
      const remainingInvoiceQuantity = Math.max(totalRequiredQuantity - alreadyScannedQuantity, 0);
      const requestedDispatchQuantity = normalizePositiveInteger(dispatchQuantity) ?? remainingInvoiceQuantity;
      const currentWarehouseStockQty = repositories.serials.countAvailableStock
        ? await repositories.serials.countAvailableStock({
            warehouseId,
            productIds: productIdsForInvoice(invoice)
          })
        : remainingInvoiceQuantity;
      const targetQuantity = alreadyScannedQuantity + requestedDispatchQuantity;

      if (remainingInvoiceQuantity <= 0) {
        throw Object.assign(new Error("Invoice has already been fully dispatched."), {
          status: 409,
          code: "INVOICE_ALREADY_DISPATCHED",
          dispatchId: existingDispatch?.dispatchId
        });
      }

      if (requestedDispatchQuantity > remainingInvoiceQuantity) {
        throw Object.assign(new Error("Dispatch quantity exceeds remaining invoice quantity."), {
          status: 409,
          code: "DISPATCH_QUANTITY_EXCEEDS_REMAINING",
          remainingInvoiceQuantity
        });
      }

      if (requestedDispatchQuantity > currentWarehouseStockQty) {
        throw Object.assign(new Error("Insufficient stock in the selected warehouse."), {
          status: 409,
          code: "INSUFFICIENT_WAREHOUSE_STOCK",
          currentWarehouseStockQty
        });
      }

      if (existingDispatch) {
        const resumedDispatch = repositories.dispatches.setDispatchTargetQuantity
          ? await repositories.dispatches.setDispatchTargetQuantity(existingDispatch.dispatchId, targetQuantity, userId)
          : { ...existingDispatch, targetQuantity };

        return {
          ...resumedDispatch,
          dispatchQuantity: requestedDispatchQuantity,
          targetQuantity,
          alreadyScannedQuantity,
          currentWarehouseStockQty,
          remainingInvoiceQuantity
        };
      }

      try {
        const dispatch = await repositories.dispatches.createDispatch({
          invoiceId,
          warehouseId,
          targetQuantity,
          createdBy: userId
        });

        return {
          ...dispatch,
          dispatchQuantity: requestedDispatchQuantity,
          targetQuantity,
          alreadyScannedQuantity,
          currentWarehouseStockQty,
          remainingInvoiceQuantity
        };
      } catch (error) {
        if (error.code === "23505" && error.constraint === "ux_dispatch_invoice_once") {
          throw Object.assign(new Error("A dispatch already exists for this invoice."), {
            status: 409,
            code: "DISPATCH_ALREADY_EXISTS"
          });
        }

        throw error;
      }
    },

    async scanSerial({ dispatchId, serialNo, userId }) {
      const dispatch = await repositories.dispatches.findById(dispatchId);

      if (!dispatch) {
        throw new Error("Dispatch not found");
      }

      const validationResult = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "DISPATCH",
        contextId: dispatchId,
        warehouseId: dispatch.warehouseId,
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

        const dispatchScanCount = await txRepositories.dispatches.countScans(dispatchId);
        const targetQuantity = normalizePositiveInteger(lockedDispatch.targetQuantity) ?? requiredQuantity(lockedDispatch.lines);

        if (
          lockedDispatch.scans?.some((scan) => String(scan.serialId) === String(validationResult.serial.serialId))
        ) {
          const exception = await recordDispatchException(txRepositories, {
            serialNo,
            ruleCode: "ALREADY_DISPATCHED",
            dispatchId,
            userId
          });
          return invalidScanWithException(
            "ALREADY_DISPATCHED",
            "Serial has already been scanned for dispatch.",
            exception
          );
        }

        if (dispatchScanCount >= targetQuantity) {
          const exception = await recordDispatchException(txRepositories, {
            serialNo,
            ruleCode: "DISPATCH_QUANTITY_REACHED",
            dispatchId,
            userId
          });
          return invalidScanWithException(
            "DISPATCH_QUANTITY_REACHED",
            "Selected dispatch quantity has already been scanned.",
            exception
          );
        }

        const { line: lockedLine } = await findAvailableLine(
          txRepositories,
          lockedDispatch,
          validationResult.serial.productId
        );

        if (!lockedLine) {
          const exception = await recordDispatchException(txRepositories, {
            serialNo,
            ruleCode: "PRODUCT_INVOICE_MISMATCH",
            dispatchId,
            userId
          });
          return invalidScanWithException(
            "PRODUCT_INVOICE_MISMATCH",
            "Serial product does not match the invoice or invoice line quantity is already scanned.",
            exception
          );
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
          invoiceLineId: lockedLine.invoiceLineId,
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

        const scannedQuantity = dispatchScanCount + 1;
        const status = scannedQuantity >= targetQuantity ? "DISPATCHED" : "IN_PROGRESS";
        const invoiceStatus = invoiceStatusFor({
          invoiceRequiredQuantity: requiredQuantity(lockedDispatch.lines),
          scannedQuantity
        });

        await txRepositories.dispatches.updateStatus(dispatchId, status);
        await txRepositories.invoices.updateStatus(lockedDispatch.invoiceId, invoiceStatus);

        return {
          valid: true,
          status,
          scan: {
            dispatchScanId: scan.dispatchScanId,
            dispatchId,
            invoiceLineId: lockedLine.invoiceLineId,
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
        const targetQuantity = normalizePositiveInteger(dispatch.targetQuantity) ?? requiredQuantity(dispatch.lines);
        const completion = fulfilmentStatusService.canCompleteDispatch({
          requiredQuantity: targetQuantity,
          scannedQuantity
        });

        await txRepositories.dispatches.updateStatus(dispatchId, completion.status);
        await txRepositories.invoices.updateStatus(
          dispatch.invoiceId,
          invoiceStatusFor({
            invoiceRequiredQuantity: requiredQuantity(dispatch.lines),
            scannedQuantity
          })
        );

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
