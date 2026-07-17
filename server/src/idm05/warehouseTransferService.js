import { assertWarehouseActive } from "../warehouseGuard.js";

// Moves stock between two of the company's own warehouses, gated by an invoice
// (Finding #3) exactly like a customer dispatch: the transfer references an
// invoice, and each scanned serial's product must appear on an invoice line that
// still has remaining quantity, else PRODUCT_INVOICE_MISMATCH.
// Reuses the exact sap_dispatch_doc / sap_dispatch_line pipeline that SAP-imported
// factory dispatches use (see importService.js): scanning here creates a doc +
// lines and flips each serial IN_STOCK -> IN_TRANSIT, then the destination
// warehouse receives it with the existing, unmodified GRN flow.
//
// The invoice here is a manifest of what is authorised to move, not a customer
// sale — so unlike dispatch we do NOT block a fully-DISPATCHED invoice (a transfer
// never mutates invoice status). Only the product/quantity gate is mirrored.

// Sum of invoice-line quantities per productId — the cap on how many serials of
// each product this transfer may move. Built once from the (static) invoice lines.
function buildProductQuantityCaps(invoice) {
  const caps = new Map();
  for (const line of invoice.lines) {
    const productId = Number(line.productId);
    caps.set(productId, (caps.get(productId) ?? 0) + Number(line.quantity));
  }
  return caps;
}

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

    async startTransfer({ sourceWarehouseId, destinationWarehouseId, reference, invoiceId, userId }) {
      if (Number(sourceWarehouseId) === Number(destinationWarehouseId)) {
        throw Object.assign(new Error("Source and destination warehouse must be different."), { status: 400 });
      }

      // A transfer is now invoice-gated (Finding #3): the invoice is the manifest
      // of what may move, so it is required and must exist.
      if (invoiceId === undefined || invoiceId === null || invoiceId === "") {
        throw Object.assign(new Error("An invoice is required to start a transfer."), {
          status: 400,
          code: "VALIDATION_ERROR"
        });
      }

      const invoice = await repositories.invoices.findById(invoiceId);
      if (!invoice) {
        throw Object.assign(new Error("Invoice not found"), { status: 404 });
      }

      // A transfer needs a TRANSFER invoice — one that names the route itself
      // (V030). Customer invoices carry no route and cannot gate a transfer.
      if (invoice.invoiceType !== "TRANSFER") {
        throw Object.assign(
          new Error("This is a customer invoice — a warehouse transfer needs a transfer invoice."),
          { status: 409, code: "INVOICE_TYPE_MISMATCH" }
        );
      }

      // The selected route must be exactly the invoice's route.
      if (
        Number(invoice.sourceWarehouseId) !== Number(sourceWarehouseId) ||
        Number(invoice.destinationWarehouseId) !== Number(destinationWarehouseId)
      ) {
        throw Object.assign(
          new Error("Source/destination warehouses do not match this transfer invoice's route."),
          { status: 409, code: "TRANSFER_ROUTE_MISMATCH" }
        );
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
        invoiceId,
        createdBy: userId
      });

      return {
        sapDispatchDocId: doc.sapDispatchDocId,
        externalRef: doc.externalRef,
        sourceWarehouseId: doc.sourceWarehouseId,
        destinationWarehouseId: doc.destinationWarehouseId,
        invoiceId: doc.invoiceId
      };
    },

    // Product-first scan (mirrors GRN/dispatch): the operator selects the invoice
    // line they are about to scan, then scans the raw base serial for it.
    // `productId` is that selected-product context, forwarded to validateSerial as
    // `expectedProductId`, which (a) disambiguates a base serial shared by several
    // products to the selected product's row and (b) rejects a scan whose resolved
    // product does not match the selection (PRODUCT_INVOICE_MISMATCH). `productId`
    // is optional: an omitted context keeps the legacy scan behaviour, gated only
    // by the invoice-wide product/quantity caps below.
    async scanSerial({ sapDispatchDocId, sourceWarehouseId, serialNo, productId, userId }) {
      // Refuse further scanning once the source warehouse is deactivated.
      await assertWarehouseActive(repositories, sourceWarehouseId, "source warehouse");

      // Load the gating invoice for this transfer (Finding #3). Docs created before
      // the invoice gate — or SAP factory imports — carry no invoice_id; those keep
      // the legacy behaviour of moving any IN_STOCK serial.
      const doc = await repositories.sapDispatches.findById(sapDispatchDocId);
      const invoice = doc?.invoiceId ? await repositories.invoices.findById(doc.invoiceId) : null;
      const productQuantityCaps = invoice ? buildProductQuantityCaps(invoice) : null;

      const validationResult = await repositories.validationService.validateSerial({
        serialNo,
        contextType: "DISPATCH",
        contextId: sapDispatchDocId,
        warehouseId: sourceWarehouseId,
        expectedProductId: productId ?? undefined,
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

        // Invoice product/quantity gate (mirror of dispatch's PRODUCT_INVOICE_MISMATCH).
        // The serial's product must be on the gating invoice and still have remaining
        // quantity for this transfer. Counting under the doc lock serializes concurrent
        // scans so two serials can't both slip past the same last remaining unit.
        if (productQuantityCaps) {
          const serialProductId = Number(validationResult.serial.productId);
          const cap = productQuantityCaps.get(serialProductId) ?? 0;
          const alreadyScanned = await txRepositories.sapDispatches.countLinesByProduct(
            sapDispatchDocId,
            serialProductId
          );

          if (cap <= 0 || alreadyScanned >= cap) {
            const exception = await recordTransferException(txRepositories, {
              serialNo,
              ruleCode: "PRODUCT_INVOICE_MISMATCH",
              sapDispatchDocId,
              userId
            });
            return invalidScanWithException(
              "PRODUCT_INVOICE_MISMATCH",
              "Serial product does not match the invoice or invoice line quantity is already scanned.",
              exception
            );
          }
        }

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
