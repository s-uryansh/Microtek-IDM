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
  function lineCapResolver(dispatch) {
    // When the operator picked per-line quantities, dispatch_line rows give each line a
    // target_quantity. Lines the operator did NOT pick have no target and therefore a cap
    // of 0 (cannot be dispatched). Legacy dispatches (no per-line targets at all) fall back
    // to the full invoice line quantity for every line.
    const usesLineTargets = dispatch.lines.some(
      (line) => line.targetQuantity !== null && line.targetQuantity !== undefined
    );

    return (line) => {
      if (!usesLineTargets) {
        return Number(line.quantity);
      }
      return Number(line.targetQuantity) || 0;
    };
  }

  async function findAvailableLine(txRepositories, dispatch, serialProductId) {
    const candidateLines = dispatch.lines.filter((line) => String(line.productId) === String(serialProductId));
    const capFor = lineCapResolver(dispatch);

    for (const line of candidateLines) {
      const lineScanCount = await txRepositories.dispatches.countScansForLine(dispatch.dispatchId, line.invoiceLineId);
      if (lineScanCount < capFor(line)) {
        return { line, lineScanCount };
      }
    }

    return { line: null, lineScanCount: 0 };
  }

  function invoiceStatusFor({ invoiceRequiredQuantity, scannedQuantity }) {
    if (scannedQuantity >= invoiceRequiredQuantity) {
      return "DISPATCHED";
    }
    if (scannedQuantity <= 0) {
      return "PENDING";
    }
    return "PARTIALLY_DISPATCHED";
  }

  return {
    async getDispatchWarehouseId(dispatchId) {
      return repositories.dispatches.getWarehouseId(dispatchId);
    },

    async getAvailability({ invoiceId, warehouseId }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      // Invoices are warehouse-agnostic. Availability is computed against the
      // operator's own warehouse (warehouseId); the invoice only supplies the
      // products and required quantities.
      if (!invoice) {
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

    async startDispatch({ invoiceId, warehouseId, userId }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      // Any operator may dispatch any invoice from their assigned warehouse.
      // The dispatch row records that warehouse; per-serial validation later
      // enforces that each scanned serial physically lives there.
      if (!invoice) {
        throw Object.assign(new Error("Invoice not found"), { status: 404 });
      }

      // An invoice already fully dispatched cannot be dispatched again.
      if (invoice.status === "DISPATCHED") {
        throw Object.assign(new Error("Invoice has already been fully dispatched."), {
          status: 409,
          code: "INVOICE_ALREADY_DISPATCHED"
        });
      }

      const totalRequiredQuantity = requiredQuantity(invoice.lines);
      const existingDispatch = await repositories.dispatches.findByInvoiceId(invoiceId);
      const alreadyScannedQuantity = existingDispatch
        ? await repositories.dispatches.countScans(existingDispatch.dispatchId)
        : 0;
      const remainingInvoiceQuantity = Math.max(totalRequiredQuantity - alreadyScannedQuantity, 0);

      if (remainingInvoiceQuantity <= 0) {
        throw Object.assign(new Error("Invoice has already been fully dispatched."), {
          status: 409,
          code: "INVOICE_ALREADY_DISPATCHED",
          dispatchId: existingDispatch?.dispatchId
        });
      }

      const currentWarehouseStockQty = repositories.serials.countAvailableStock
        ? await repositories.serials.countAvailableStock({
            warehouseId,
            productIds: productIdsForInvoice(invoice)
          })
        : remainingInvoiceQuantity;

      if (currentWarehouseStockQty <= 0) {
        throw Object.assign(new Error("No stock is available in the warehouse for this invoice."), {
          status: 409,
          code: "NO_WAREHOUSE_STOCK",
          currentWarehouseStockQty: 0
        });
      }

      // Dispatch the full remaining invoice quantity. Only when the warehouse cannot
      // cover it do we fall back to a partial dispatch of whatever stock is available —
      // and that shortfall is flagged with an exception. The operator never chooses a
      // smaller quantity by hand when stock is sufficient.
      const isPartial = currentWarehouseStockQty < remainingInvoiceQuantity;
      const dispatchQuantity = isPartial ? currentWarehouseStockQty : remainingInvoiceQuantity;
      const targetQuantity = alreadyScannedQuantity + dispatchQuantity;

      let dispatchRow;
      let createdNew = false;

      if (existingDispatch) {
        dispatchRow = repositories.dispatches.setDispatchTargetQuantity
          ? await repositories.dispatches.setDispatchTargetQuantity(existingDispatch.dispatchId, targetQuantity, userId)
          : { ...existingDispatch, targetQuantity };
      } else {
        try {
          dispatchRow = await repositories.dispatches.createDispatch({
            invoiceId,
            warehouseId,
            targetQuantity,
            createdBy: userId
          });
          createdNew = true;
        } catch (error) {
          if (error.code === "23505" && error.constraint === "ux_dispatch_invoice_once") {
            throw Object.assign(new Error("A dispatch already exists for this invoice."), {
              status: 409,
              code: "DISPATCH_ALREADY_EXISTS"
            });
          }
          throw error;
        }
      }

      // Raise a SHORT exception for a brand-new partial dispatch so the shortfall is
      // tracked. (Resuming an existing dispatch does not re-raise.)
      let partialException = null;
      if (isPartial && createdNew && repositories.exceptionsRepo) {
        const exception = await repositories.exceptionsRepo.createException({
          serialNo: null,
          ruleCode: "SHORT",
          contextType: "DISPATCH",
          contextId: dispatchRow.dispatchId,
          warehouseId,
          raisedBy: userId,
          createdBy: userId
        });
        partialException = {
          exceptionId: exception.exceptionId,
          ruleCode: exception.ruleCode,
          status: exception.status ?? "OPEN"
        };
      }

      return {
        ...dispatchRow,
        dispatchQuantity,
        targetQuantity,
        alreadyScannedQuantity,
        remainingInvoiceQuantity,
        currentWarehouseStockQty,
        partial: isPartial,
        partialException
      };
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

        // Condition hold: a serial returned as DEFECTIVE or REPAIR stays in stock
        // but must not be dispatched until it has been retagged SALEABLE via the
        // condition-correction screen. Block it here as defence in depth (it is
        // also excluded from available-stock counts).
        if (
          validationResult.serial.conditionTag === "DEFECTIVE" ||
          validationResult.serial.conditionTag === "REPAIR"
        ) {
          const exception = await recordDispatchException(txRepositories, {
            serialNo,
            ruleCode: "CONDITION_HOLD",
            dispatchId,
            userId
          });
          return invalidScanWithException(
            "CONDITION_HOLD",
            `Serial is on condition hold (${validationResult.serial.conditionTag}). Correct the condition tag to SALEABLE before dispatch.`,
            exception
          );
        }

        // Battery gate: a battery unit must be pre-billed (committed in IDM-03)
        // before it can be dispatched. Block any battery serial that has no
        // pre-billing commit.
        if (lockedLine.isBattery) {
          // The pre-billing commit must belong to THIS invoice — a battery
          // pre-billed against another invoice does not authorise dispatch here.
          const committed = txRepositories.batteryPreBilling?.findCommitForInvoice
            ? await txRepositories.batteryPreBilling.findCommitForInvoice(
                validationResult.serial.serialId,
                lockedDispatch.invoiceId
              )
            : await txRepositories.batteryPreBilling?.findCommitBySerial?.(validationResult.serial.serialId);
          if (!committed) {
            const exception = await recordDispatchException(txRepositories, {
              serialNo,
              ruleCode: "BATTERY_NOT_PREBILLED",
              dispatchId,
              userId
            });
            return invalidScanWithException(
              "BATTERY_NOT_PREBILLED",
              "Battery must be pre-billed for this invoice before dispatch. Commit this serial in Battery Pre-Billing first.",
              exception
            );
          }
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
