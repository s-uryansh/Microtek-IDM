import { createReceiptException, invalidReceipt } from "./receiptExceptions.js";

export function createScanReceipt({ repositories }) {
  return async function scanReceipt({ serialNo, receivingWarehouseId, userId }) {
    const serial = await repositories.serials.findBySerialNo(serialNo);

    if (!serial) {
      const exception = await createReceiptException(repositories, {
        serialNo,
        ruleCode: "NOT_FOUND",
        grnId: null,
        userId
      });
      return invalidReceipt("NOT_FOUND", "Serial was not found in the SAP dispatch registry.", exception);
    }

    // Layer 1 (fast path): a serial that is already IN_STOCK has been received
    // before. The serial row is already loaded, so this costs no extra query
    // and stops a cross-session duplicate before any GRN is created. The DB
    // unique index on grn_scan is the race-safe backstop (see insertScan below).
    if (serial.currentStatus === "IN_STOCK") {
      const exception = await createReceiptException(repositories, {
        serialNo,
        ruleCode: "DUPLICATE_SCAN",
        grnId: null,
        userId
      });
      return {
        ...invalidReceipt("DUPLICATE_SCAN", "Serial has already been received into stock.", exception),
        serialNo
      };
    }

    const dispatch = await repositories.sapDispatches?.findBySerialId
      ? await repositories.sapDispatches.findBySerialId(serial.serialId)
      : null;

    if (!dispatch) {
      const exception = await createReceiptException(repositories, {
        serialNo,
        ruleCode: "WRONG_SERIAL",
        grnId: null,
        userId
      });
      return invalidReceipt("WRONG_SERIAL", "Serial is not linked to an original SAP factory dispatch.", exception);
    }

    if (dispatch.ambiguous) {
      return {
        ...invalidReceipt(
          "AMBIGUOUS_DISPATCH",
          "Serial maps to multiple SAP dispatch documents; ownership must be resolved before receipt.",
          null
        ),
        serialNo,
        candidateDispatchDocIds: dispatch.candidateDispatchDocIds
      };
    }

    const runReceiptWrite = repositories.withTransaction
      ? (work) => repositories.withTransaction(work)
      : (work) => work(repositories);

    return runReceiptWrite(async (txRepositories) => {
      const grn = await txRepositories.grns.create({
        sapDispatchDocId: dispatch.sapDispatchDocId,
        receivingWarehouseId,
        createdBy: userId
      });

      if (String(dispatch.destinationWarehouseId) !== String(receivingWarehouseId)) {
        const exception = await createReceiptException(txRepositories, {
          serialNo,
          ruleCode: "WRONG_WAREHOUSE",
          grnId: grn.grnId,
          userId
        });
        await txRepositories.grns.updateStatus(grn.grnId, "EXCEPTION", userId);
        return {
          ...invalidReceipt(
            "WRONG_WAREHOUSE",
            "Scanned serial was dispatched by SAP to a different destination warehouse.",
            exception
          ),
          serialNo,
          sourceWarehouseId: dispatch.sourceWarehouseId,
          expectedWarehouseId: dispatch.destinationWarehouseId,
          receivedWarehouseId: receivingWarehouseId,
          sapDispatchDocId: dispatch.sapDispatchDocId
        };
      }

      const existingScan = await txRepositories.grns.findScanBySerial(grn.grnId, serial.serialId);

      if (existingScan) {
        const exception = await createReceiptException(txRepositories, {
          serialNo,
          ruleCode: "DUPLICATE_SCAN",
          grnId: grn.grnId,
          userId
        });
        return {
          ...invalidReceipt("DUPLICATE_SCAN", "Serial has already been received for this SAP dispatch.", exception),
          serialNo,
          sourceWarehouseId: dispatch.sourceWarehouseId,
          expectedWarehouseId: dispatch.destinationWarehouseId,
          receivedWarehouseId: receivingWarehouseId,
          sapDispatchDocId: dispatch.sapDispatchDocId
        };
      }

      // Layer 2 (race-safe backstop): insertScan uses ON CONFLICT DO NOTHING,
      // so under a concurrent/retried receipt the DB unique index on grn_scan
      // rejects the second insert and returns no row. Treat that as a duplicate
      // rather than falling through to a false MATCHED.
      const insertedScan = await txRepositories.grns.insertScan({
        grnId: grn.grnId,
        serialId: serial.serialId,
        serialNo,
        matchStatus: "MATCHED",
        scannedBy: userId,
        createdBy: userId
      });

      if (!insertedScan) {
        const exception = await createReceiptException(txRepositories, {
          serialNo,
          ruleCode: "DUPLICATE_SCAN",
          grnId: grn.grnId,
          userId
        });
        return {
          ...invalidReceipt("DUPLICATE_SCAN", "Serial has already been received for this SAP dispatch.", exception),
          serialNo,
          sourceWarehouseId: dispatch.sourceWarehouseId,
          expectedWarehouseId: dispatch.destinationWarehouseId,
          receivedWarehouseId: receivingWarehouseId,
          sapDispatchDocId: dispatch.sapDispatchDocId
        };
      }

      await txRepositories.serials.updateReceipt(serial.serialId, receivingWarehouseId, userId);
      await txRepositories.serials.appendSerialEvent({
        serialId: serial.serialId,
        eventType: "GRN",
        warehouseId: receivingWarehouseId,
        referenceType: "GRN",
        referenceId: grn.grnId,
        createdBy: userId
      });
      await txRepositories.grns.updateStatus(grn.grnId, "IN_PROGRESS", userId);

      return {
        valid: true,
        matchStatus: "MATCHED",
        serialNo,
        serialId: serial.serialId,
        sourceWarehouseId: dispatch.sourceWarehouseId,
        expectedWarehouseId: dispatch.destinationWarehouseId,
        receivedWarehouseId: receivingWarehouseId,
        sapDispatchDocId: dispatch.sapDispatchDocId,
        grnId: grn.grnId,
        alert: null,
        exception: null
      };
    });
  };
}
