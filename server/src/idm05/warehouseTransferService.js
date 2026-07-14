import { assertWarehouseActive } from "../warehouseGuard.js";

// Moves stock between two of the company's own warehouses without an invoice.
// Reuses the exact sap_dispatch_doc / sap_dispatch_line pipeline that SAP-imported
// factory dispatches use (see importService.js): scanning here creates a doc +
// lines and flips each serial IN_STOCK -> IN_TRANSIT, then the destination
// warehouse receives it with the existing, unmodified GRN flow.

function invalidScan(ruleCode, message) {
  return {
    valid: false,
    serial: null,
    alert: { ruleCode, message },
    exception: null
  };
}

function invalidScanWithException(ruleCode, message, exception) {
  return { ...invalidScan(ruleCode, message), exception };
}

async function recordTransferException(repositories, { serialNo, ruleCode, sapDispatchDocId, userId }) {
  if (!repositories.exceptionsRepo) {
    return null;
  }

  const exception = await repositories.exceptionsRepo.createException({
    serialNo,
    ruleCode,
    contextType: "DISPATCH",
    contextId: sapDispatchDocId,
    raisedBy: userId,
    createdBy: userId
  });

  return {
    exceptionId: exception.exceptionId,
    ruleCode: exception.ruleCode,
    status: exception.status ?? "OPEN"
  };
}

export function createWarehouseTransferService({ repositories }) {
  return {
    async getTransferWarehouseId(sapDispatchDocId) {
      const doc = await repositories.sapDispatches.findById(sapDispatchDocId);
      return doc?.sourceWarehouseId ?? null;
    },

    async startTransfer({ sourceWarehouseId, destinationWarehouseId, reference, userId }) {
      if (Number(sourceWarehouseId) === Number(destinationWarehouseId)) {
        throw Object.assign(new Error("Source and destination warehouse must be different."), { status: 400 });
      }

      // Both ends of a transfer must be active warehouses.
      await assertWarehouseActive(repositories, sourceWarehouseId, "source warehouse");
      await assertWarehouseActive(repositories, destinationWarehouseId, "destination warehouse");

      const trimmedRef = typeof reference === "string" ? reference.trim() : "";
      const externalRef = trimmedRef || `WT-${sourceWarehouseId}-${destinationWarehouseId}-${Date.now()}`;

      const existingDoc = await repositories.grns.findDocByRef(externalRef, null);
      if (existingDoc) {
        const sameRoute =
          Number(existingDoc.sourceWarehouseId) === Number(sourceWarehouseId) &&
          Number(existingDoc.destinationWarehouseId) === Number(destinationWarehouseId);

        if (!sameRoute) {
          throw Object.assign(new Error("This reference is already used by a different transfer."), {
            status: 409,
            code: "REFERENCE_IN_USE"
          });
        }
        if (existingDoc.status === "GRN_CLOSED") {
          throw Object.assign(new Error("This transfer has already been received at the destination."), {
            status: 409,
            code: "ALREADY_RECEIVED"
          });
        }
      }

      const doc = await repositories.sapDispatches.upsertDoc({
        externalRef,
        sourceWarehouseId,
        destinationWarehouseId,
        batchId: null,
        createdBy: userId
      });

      return {
        sapDispatchDocId: doc.sapDispatchDocId,
        externalRef: doc.externalRef,
        sourceWarehouseId: doc.sourceWarehouseId,
        destinationWarehouseId: doc.destinationWarehouseId
      };
    },

    async scanSerial({ sapDispatchDocId, sourceWarehouseId, serialNo, userId }) {
      // Refuse further scanning once the source warehouse is deactivated.
      await assertWarehouseActive(repositories, sourceWarehouseId, "source warehouse");

      const validationResult = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "DISPATCH",
        contextId: sapDispatchDocId,
        warehouseId: sourceWarehouseId,
        userId
      });

      if (!validationResult.valid) {
        return validationResult;
      }

      if (validationResult.serial.currentStatus !== "IN_STOCK") {
        const exception = await recordTransferException(repositories, {
          serialNo,
          ruleCode: "ALREADY_DISPATCHED",
          sapDispatchDocId,
          userId
        });
        return invalidScanWithException(
          "ALREADY_DISPATCHED",
          "Serial is not currently in stock at this warehouse.",
          exception
        );
      }

      return repositories.withTransaction(async (txRepositories) => {
        await txRepositories.sapDispatches.lockDocById(sapDispatchDocId);
        const lineCount = await txRepositories.sapDispatches.countLines(sapDispatchDocId);

        const serialUpdated = await txRepositories.serials.updateStatusIfCurrent(
          validationResult.serial.serialId,
          "IN_STOCK",
          "IN_TRANSIT",
          userId
        );

        if (!serialUpdated) {
          const exception = await recordTransferException(txRepositories, {
            serialNo,
            ruleCode: "ALREADY_DISPATCHED",
            sapDispatchDocId,
            userId
          });
          return invalidScanWithException(
            "ALREADY_DISPATCHED",
            "Serial is not currently in stock at this warehouse.",
            exception
          );
        }

        const line = await txRepositories.sapDispatches.insertLine({
          sapDispatchDocId,
          serialId: validationResult.serial.serialId,
          productId: validationResult.serial.productId,
          lineNo: lineCount + 1,
          createdBy: userId
        });

        if (!line) {
          const exception = await recordTransferException(txRepositories, {
            serialNo,
            ruleCode: "ALREADY_DISPATCHED",
            sapDispatchDocId,
            userId
          });
          return invalidScanWithException("ALREADY_DISPATCHED", "Serial has already been scanned for this transfer.", exception);
        }

        await txRepositories.serials.appendSerialEvent({
          serialId: validationResult.serial.serialId,
          eventType: "TRANSFER",
          warehouseId: sourceWarehouseId,
          referenceType: "DISPATCH",
          referenceId: sapDispatchDocId,
          createdBy: userId
        });

        return {
          valid: true,
          status: "SCANNED",
          scan: {
            sapDispatchLineId: line.sapDispatchLineId,
            sapDispatchDocId,
            serialId: validationResult.serial.serialId,
            serialNo: validationResult.serial.serialNo
          },
          alert: null,
          exception: null
        };
      });
    }
  };
}
