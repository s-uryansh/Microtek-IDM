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

export function createSrnService({ repositories, conditionTagService }) {
  return {
    async createSrn({ receivingWarehouseId, invoiceId, returnProductIds, userId }) {
      // A return is only valid for an invoice that was actually dispatched. If
      // the invoice has no serials from a completed dispatch, there is nothing
      // legitimate that could be coming back, so the invoice id is rejected.
      if (invoiceId && !(await repositories.srns.invoiceHasDispatchedSerials(invoiceId))) {
        throw Object.assign(new Error("Invoice has not been dispatched; there is nothing to return."), {
          status: 409,
          code: "INVOICE_NOT_DISPATCHED"
        });
      }

      return repositories.srns.create({
        receivingWarehouseId,
        invoiceId,
        returnProductIds,
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

        await txRepositories.serials.updateReceipt(validation.serial.serialId, lockedSrn.receivingWarehouseId, userId);
        await txRepositories.serials.appendSerialEvent({
          serialId: validation.serial.serialId,
          eventType: "SRN",
          warehouseId: lockedSrn.receivingWarehouseId,
          referenceType: "SRN",
          referenceId: srnId,
          createdBy: userId
        });

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
