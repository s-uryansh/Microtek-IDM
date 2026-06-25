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
  // Merge a dispatch doc's expected products with what this GRN has received so
  // far, keyed by product + batch, for the operator's progress view. No serials.
  async function buildExpectedProducts(grnId, sapDispatchDocId) {
    const [expected, received] = await Promise.all([
      repositories.grns.expectedProducts(sapDispatchDocId),
      repositories.grns.receivedCountsByProduct(grnId)
    ]);

    const keyOf = (row) => `${row.productId}|${row.batchNo ?? ""}`;
    const receivedByKey = new Map(received.map((row) => [keyOf(row), row.receivedQty]));

    return expected.map((item) => ({
      ...item,
      receivedQty: receivedByKey.get(keyOf(item)) ?? 0
    }));
  }

  return {
    // Two modes:
    //  - dispatchRef given  => bind the GRN to that SAP dispatch document and
    //    return its expected products (operator entered/scanned a dispatch number).
    //  - dispatchRef omitted => legacy warehouse-scoped GRN (unlinked).
    async startGrn({ receivingWarehouseId, dispatchRef, role, userWarehouseIds, userId }) {
      const ref = typeof dispatchRef === "string" ? dispatchRef.trim() : dispatchRef;

      if (!ref) {
        return repositories.grns.create({
          receivingWarehouseId,
          createdBy: userId
        });
      }

      const scope = role === "admin" ? null : (userWarehouseIds ?? []);
      const doc = await repositories.grns.findDocByRef(String(ref), scope);

      if (!doc) {
        const error = new Error("Dispatch document not found");
        error.status = 404;
        error.code = "NOT_FOUND";
        throw error;
      }

      if (String(doc.destinationWarehouseId) !== String(receivingWarehouseId)) {
        const error = new Error("Dispatch document is destined for a different warehouse");
        error.status = 409;
        error.code = "WRONG_WAREHOUSE";
        throw error;
      }

      // Already received: the dispatch doc is marked GRN_CLOSED, or a prior GRN for
      // it has already been closed/matched. Block starting a fresh session.
      const completed = doc.status === "GRN_CLOSED"
        ? { grnId: null }
        : await repositories.grns.findCompletedByDoc(doc.sapDispatchDocId);

      if (completed) {
        const error = new Error("This dispatch document has already been received");
        error.status = 409;
        error.code = "ALREADY_RECEIVED";
        throw error;
      }

      const existing = await repositories.grns.findOpenByDoc(doc.sapDispatchDocId, receivingWarehouseId);
      const grn =
        existing ??
        (await repositories.grns.create({
          receivingWarehouseId,
          sapDispatchDocId: doc.sapDispatchDocId,
          createdBy: userId
        }));

      const expectedProducts = await buildExpectedProducts(grn.grnId, doc.sapDispatchDocId);

      return {
        ...grn,
        sapDispatchDocId: doc.sapDispatchDocId,
        dispatchRef: doc.externalRef,
        expectedProducts
      };
    },

    async getGrn({ grnId }) {
      const grn = await repositories.grns.findById(grnId);

      if (!grn) {
        throw new Error("GRN not found");
      }

      if (grn.sapDispatchDocId) {
        grn.expectedProducts = await buildExpectedProducts(grnId, grn.sapDispatchDocId);
      }

      return grn;
    },

    async getGrnWarehouseId(grnId) {
      return repositories.grns.getWarehouseId(grnId);
    },

    // Canonical serial-scan path (recommended). Overlaps with
    // importService.scanReceipt (POST /api/idm-01/import/receipts/scans); see
    // SCRATCH_receipt_vs_grn_scan.txt for the comparison and why this path is
    // preferred (central validation, EXCESS vs WRONG_SERIAL, row locking).
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

      // Cross-session duplicate: a serial already IN_STOCK was received by a prior
      // (now-closed) GRN. findScanBySerial below is scoped to THIS grnId and a new
      // GRN is started per session, so it cannot see that earlier receipt — the
      // serial's own status is the cross-session signal. The DB unique index on
      // grn_scan is the race-safe backstop (see insertScan below).
      if (validation.serial.currentStatus === "IN_STOCK") {
        const exception = await createException(repositories, {
          serialNo,
          ruleCode: "DUPLICATE_SCAN",
          grnId,
          userId
        });
        return exceptionResult({
          matchStatus: "DUPLICATE_SCAN",
          ruleCode: "DUPLICATE_SCAN",
          message: "Serial has already been received into stock.",
          exception
        });
      }

      // Dispatch-doc-bound GRN: the serial must belong to a product listed on the
      // bound dispatch document (product-level match). Serials whose product is
      // not on the document are rejected. Warehouse-scoped GRNs (no bound doc)
      // fall through to the legacy serial-level reconciliation below.
      if (grn.sapDispatchDocId) {
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

          const productInDoc = await txRepositories.grns.isProductInDoc(
            grn.sapDispatchDocId,
            validation.serial.productId
          );

          if (!productInDoc) {
            const exception = await createException(txRepositories, {
              serialNo,
              ruleCode: "WRONG_SERIAL",
              grnId,
              userId
            });
            await txRepositories.grns.insertScan({
              grnId,
              serialId: validation.serial.serialId,
              serialNo,
              matchStatus: "WRONG_SERIAL",
              scannedBy: userId,
              createdBy: userId
            });
            await txRepositories.grns.updateStatus(grnId, "EXCEPTION", userId);
            return exceptionResult({
              matchStatus: "WRONG_SERIAL",
              ruleCode: "WRONG_SERIAL",
              message: "Serial's product is not part of this dispatch document.",
              exception
            });
          }

          const insertedScan = await txRepositories.grns.insertScan({
            grnId,
            serialId: validation.serial.serialId,
            serialNo,
            matchStatus: "MATCHED",
            scannedBy: userId,
            createdBy: userId
          });

          if (!insertedScan) {
            const exception = await createException(txRepositories, {
              serialNo,
              ruleCode: "DUPLICATE_SCAN",
              grnId,
              userId
            });
            return exceptionResult({
              matchStatus: "DUPLICATE_SCAN",
              ruleCode: "DUPLICATE_SCAN",
              message: "Serial has already been received into stock.",
              exception
            });
          }

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
            productId: validation.serial.productId,
            alert: null,
            exception: null
          };
        });
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

        // Validation Handshake: the serial is on this GRN's dispatch document, but the
        // document's destination warehouse must match the warehouse physically receiving it.
        // A mismatch means the stock has been misdirected to the wrong warehouse — block it.
        if (
          expectedLine.destinationWarehouseId != null &&
          String(expectedLine.destinationWarehouseId) !== String(lockedGrn.receivingWarehouseId)
        ) {
          const exception = await createException(txRepositories, {
            serialNo,
            ruleCode: "WRONG_WAREHOUSE",
            grnId,
            userId
          });
          await txRepositories.grns.insertScan({
            grnId,
            serialId: validation.serial.serialId,
            serialNo,
            matchStatus: "WRONG_SERIAL",
            scannedBy: userId,
            createdBy: userId
          });
          await txRepositories.grns.updateStatus(grnId, "EXCEPTION", userId);
          return exceptionResult({
            matchStatus: "WRONG_WAREHOUSE",
            ruleCode: "WRONG_WAREHOUSE",
            message: "Serial's dispatch destination does not match this GRN's receiving warehouse.",
            exception
          });
        }

        // ON CONFLICT DO NOTHING: if the grn_scan unique index rejects a
        // concurrent/retried receipt, no row is returned. Treat that as a
        // duplicate instead of falling through to a false MATCHED + receipt write.
        const insertedScan = await txRepositories.grns.insertScan({
          grnId,
          serialId: validation.serial.serialId,
          serialNo,
          matchStatus: "MATCHED",
          scannedBy: userId,
          createdBy: userId
        });

        if (!insertedScan) {
          const exception = await createException(txRepositories, {
            serialNo,
            ruleCode: "DUPLICATE_SCAN",
            grnId,
            userId
          });
          return exceptionResult({
            matchStatus: "DUPLICATE_SCAN",
            ruleCode: "DUPLICATE_SCAN",
            message: "Serial has already been received into stock.",
            exception
          });
        }

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
      // Warehouse-scoped GRN: closing simply finalises the session. There is no single
      // expected document to reconcile against, so completion never invents SHORT
      // exceptions — only the per-scan exceptions raised while scanning are kept.
      return repositories.withTransaction(async (txRepositories) => {
        const grn = await txRepositories.grns.lockById(grnId);

        if (!grn) {
          throw new Error("GRN not found");
        }

        const summary = await txRepositories.grns.summarize(grnId);
        await txRepositories.grns.updateStatus(grnId, "CLOSED", userId);

        return {
          grnId,
          status: "CLOSED",
          summary
        };
      });
    }
  };
}
