import {
  requiredQuantity,
  normalizePositiveInteger,
  productIdsForInvoice,
  recordDispatchException,
  invalidScanWithException,
  formatCompletedSerialRow,
  findAvailableLine,
  invoiceStatusFor
} from "./dispatchService/helpers.js";

export function createDispatchService({ repositories, fulfilmentStatusService }) {
  return {
    async getDispatchWarehouseId(dispatchId) {
      return repositories.dispatches.getWarehouseId(dispatchId);
    },

    async getAvailability({ invoiceId, warehouseId }) {
      const invoice = await repositories.invoices.findById(invoiceId);

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

      const isPartial = currentWarehouseStockQty < remainingInvoiceQuantity;
      const dispatchQuantity = isPartial ? currentWarehouseStockQty : remainingInvoiceQuantity;
      const targetQuantity = alreadyScannedQuantity + dispatchQuantity;

      let dispatchRow;
      let createdNew = false;

      if (existingDispatch) {
        // A dispatch is warehouse-scoped (one row per invoice, pinned by the
        // ux_dispatch_invoice_once constraint). If the operator re-opens dispatch
        // for this invoice with a different warehouse selected, reconcile it —
        // otherwise scanSerial validates against the stale warehouse and every
        // scan fails with WRONG_WAREHOUSE even though the correct warehouse is
        // shown in the UI.
        if (existingDispatch.warehouseId !== warehouseId) {
          if (alreadyScannedQuantity > 0) {
            // Scans already exist against the original warehouse — the dispatch
            // is mid-flight and cannot silently switch warehouses.
            throw Object.assign(
              new Error("A dispatch is already in progress for this invoice at a different warehouse."),
              {
                status: 409,
                code: "DISPATCH_WAREHOUSE_MISMATCH",
                dispatchId: existingDispatch.dispatchId,
                existingWarehouseId: existingDispatch.warehouseId
              }
            );
          }
          // Nothing scanned yet — re-point the untouched dispatch to the newly
          // selected warehouse.
          if (repositories.dispatches.updateWarehouse) {
            await repositories.dispatches.updateWarehouse(existingDispatch.dispatchId, warehouseId, userId);
          }
        }

        dispatchRow = repositories.dispatches.setDispatchTargetQuantity
          ? await repositories.dispatches.setDispatchTargetQuantity(existingDispatch.dispatchId, targetQuantity, userId)
          : { ...existingDispatch, targetQuantity, warehouseId };

        const resumeStatus = alreadyScannedQuantity > 0 ? "IN_PROGRESS" : "PENDING";
        if (dispatchRow.status !== resumeStatus) {
          if (repositories.dispatches.updateStatus) {
            await repositories.dispatches.updateStatus(existingDispatch.dispatchId, resumeStatus);
          }
          dispatchRow = { ...dispatchRow, status: resumeStatus };
        }
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

      // A partial dispatch is a shortage regardless of whether it was detected on
      // the first start or on a resume, so raise the SHORT exception in both cases.
      // Dedupe against any already-open SHORT for this dispatch so repeated
      // re-opens don't pile up duplicate exceptions.
      let partialException = null;
      if (isPartial && repositories.exceptionsRepo) {
        const existingShort = repositories.exceptionsRepo.findOpenByContext
          ? await repositories.exceptionsRepo.findOpenByContext({
              contextType: "DISPATCH",
              contextId: dispatchRow.dispatchId,
              ruleCode: "SHORT"
            })
          : null;

        const exception =
          existingShort ??
          (await repositories.exceptionsRepo.createException({
            serialNo: null,
            ruleCode: "SHORT",
            contextType: "DISPATCH",
            contextId: dispatchRow.dispatchId,
            warehouseId,
            raisedBy: userId,
            createdBy: userId
          }));
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

        if (lockedLine.isBattery) {
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
