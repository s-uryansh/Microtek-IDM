function invalid(ruleCode, message, exception = null) {
  return {
    valid: false,
    alert: { ruleCode, message },
    exception
  };
}

async function createSrnException(repositories, { serialNo, ruleCode, srnId, userId }) {
  const exception = await repositories.exceptionsRepo.createException({
    serialNo,
    ruleCode,
    contextType: "SRN",
    contextId: srnId,
    raisedBy: userId,
    createdBy: userId
  });

  return {
    exceptionId: exception.exceptionId,
    ruleCode: exception.ruleCode,
    status: exception.status ?? "OPEN"
  };
}

async function reopenInvoice(repositories, invoiceId) {
  // After a return, the invoice's dispatched count has dropped. Recompute it and
  // persist the resulting status so a re-opened invoice can be dispatched again.
  if (!invoiceId || !repositories.invoices?.findById || !repositories.dispatches?.countScansForInvoice) {
    return;
  }

  const invoice = await repositories.invoices.findById(invoiceId);
  if (!invoice) {
    return;
  }

  const requiredQuantity = (invoice.lines ?? []).reduce((total, line) => total + Number(line.quantity), 0);
  const scannedQuantity = await repositories.dispatches.countScansForInvoice(invoiceId);

  let status = "PARTIALLY_DISPATCHED";
  if (scannedQuantity <= 0) {
    status = "PENDING";
  } else if (requiredQuantity > 0 && scannedQuantity >= requiredQuantity) {
    status = "DISPATCHED";
  }

  await repositories.invoices.updateStatus(invoiceId, status);
}

export function createSrnService({ repositories, conditionTagService }) {
  return {
    async createSrn({ receivingWarehouseId, invoiceId, returnProductIds, expectedQuantity, userId }) {
      // A return is only valid for an invoice that was actually dispatched. If
      // the invoice has no serials from a completed dispatch, there is nothing
      // legitimate that could be coming back, so the invoice id is rejected.
      if (invoiceId && !(await repositories.srns.invoiceHasDispatchedSerials(invoiceId))) {
        throw Object.assign(new Error("Invoice has not been dispatched; there is nothing to return."), {
          status: 409,
          code: "INVOICE_NOT_DISPATCHED"
        });
      }

      // The declared return quantity can never exceed what is still returnable:
      // units dispatched on this invoice minus those already returned in earlier
      // SRNs. (e.g. N dispatched, 1 already returned → at most N-1 more.)
      if (invoiceId && expectedQuantity && repositories.srns?.countReturnableForInvoice) {
        const returnable = await repositories.srns.countReturnableForInvoice(invoiceId);
        if (Number(expectedQuantity) > returnable) {
          throw Object.assign(
            new Error(`Only ${returnable} unit(s) remain returnable for this invoice.`),
            { status: 409, code: "RETURN_QUANTITY_EXCEEDS_DISPATCHED", returnable }
          );
        }
      }

      return repositories.srns.create({
        receivingWarehouseId,
        invoiceId,
        returnProductIds,
        // The operator declares how many units they expect to return; serials are
        // still scanned individually, this is the target the scan count works to.
        expectedQuantity,
        createdBy: userId
      });
    },

    async getSrnWarehouseId(srnId) {
      return repositories.srns.getWarehouseId(srnId);
    },

    async scanReturn({ srnId, serialNo, conditionTag, userId }) {
      if (!conditionTagService.isAllowed(conditionTag)) {
        const exception = await createSrnException(repositories, {
          serialNo,
          ruleCode: "INVALID_CONDITION_TAG",
          srnId,
          userId
        });
        return invalid("INVALID_CONDITION_TAG", "Condition tag is not allowed.", exception);
      }

      const srn = await repositories.srns.findById(srnId);

      if (!srn) {
        throw new Error("SRN not found");
      }

      const validation = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "SRN",
        contextId: srnId,
        userId
      });

      if (!validation.valid) {
        return validation;
      }

      return repositories.withTransaction(async (txRepositories) => {
        const lockedSrn = await txRepositories.srns.lockById(srnId);

        if (!lockedSrn) {
          throw new Error("SRN not found");
        }

        // Enforce the declared return quantity: the operator said only N units are
        // coming back, so block any scan beyond N. (No exception is logged — this
        // is an operator guard, not a data discrepancy.)
        if (lockedSrn.expectedQuantity && txRepositories.srns.countScans) {
          const alreadyScanned = await txRepositories.srns.countScans(srnId);
          if (alreadyScanned >= Number(lockedSrn.expectedQuantity)) {
            return invalid(
              "SRN_QUANTITY_REACHED",
              `All ${lockedSrn.expectedQuantity} declared return units have already been scanned.`
            );
          }
        }

        const originalDispatchScan = await txRepositories.srns.findOriginalDispatchScan(validation.serial.serialId);

        if (!originalDispatchScan) {
          const exception = await createSrnException(txRepositories, {
            serialNo,
            ruleCode: "NO_ORIGINAL_DISPATCH",
            srnId,
            userId
          });
          return invalid("NO_ORIGINAL_DISPATCH", "Serial does not reconcile to an original dispatch.", exception);
        }

        // A return is validated purely against what was actually dispatched:
        // the serial must reconcile to a completed dispatch ON THIS INVOICE.
        // (invoice_id comes back from PostgreSQL as a bigint string, so compare
        // as strings.) We deliberately do NOT gate on the operator's selected
        // product list — being a dispatched serial on this invoice is enough.
        if (lockedSrn.invoiceId && String(originalDispatchScan.invoiceId) !== String(lockedSrn.invoiceId)) {
          const exception = await createSrnException(txRepositories, {
            serialNo,
            ruleCode: "WRONG_INVOICE_SERIAL",
            srnId,
            userId
          });
          return invalid("WRONG_INVOICE_SERIAL", "Serial was not on the invoice being returned.", exception);
        }

        if (await txRepositories.srns.hasReturnedSerial(validation.serial.serialId)) {
          const exception = await createSrnException(txRepositories, {
            serialNo,
            ruleCode: "ALREADY_RETURNED",
            srnId,
            userId
          });
          return invalid("ALREADY_RETURNED", "Serial has already been returned.", exception);
        }

        const scan = await txRepositories.srns.insertScan({
          srnId,
          serialId: validation.serial.serialId,
          originalDispatchScanId: originalDispatchScan.dispatchScanId,
          conditionTag,
          scannedBy: userId,
          createdBy: userId
        });

        if (!scan) {
          const exception = await createSrnException(txRepositories, {
            serialNo,
            ruleCode: "ALREADY_RETURNED",
            srnId,
            userId
          });
          return invalid("ALREADY_RETURNED", "Serial has already been returned.", exception);
        }

        // The serial physically lands back in the warehouse it was scanned in,
        // IN_STOCK. Its condition tag rides along on the serial so the dispatch
        // path can hold DEFECTIVE/REPAIR units until they are corrected.
        await txRepositories.serials.updateReceipt(validation.serial.serialId, lockedSrn.receivingWarehouseId, userId);
        if (txRepositories.serials.setConditionTag) {
          await txRepositories.serials.setConditionTag(validation.serial.serialId, conditionTag, userId);
        }
        await txRepositories.serials.appendSerialEvent({
          serialId: validation.serial.serialId,
          eventType: "SRN",
          warehouseId: lockedSrn.receivingWarehouseId,
          referenceType: "SRN",
          referenceId: srnId,
          createdBy: userId
        });

        // Re-open the original invoice for the returned quantity: soft-return the
        // original dispatch scan so it stops counting, then recompute the invoice
        // status (which drops from DISPATCHED to PARTIALLY_DISPATCHED).
        if (txRepositories.dispatches?.markScanReturned) {
          await txRepositories.dispatches.markScanReturned(originalDispatchScan.dispatchScanId, userId);
        }
        await reopenInvoice(txRepositories, originalDispatchScan.invoiceId);

        return {
          valid: true,
          srnScanId: scan.srnScanId,
          conditionTag,
          serial: validation.serial,
          alert: null,
          exception: null
        };
      });
    }
  };
}
