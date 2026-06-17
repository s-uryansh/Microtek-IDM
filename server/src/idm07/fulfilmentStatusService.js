export function createFulfilmentStatusService(options = {}) {
  const allowIncompleteCompletion = options.allowIncompleteCompletion === true;

  function calculateStatus({ requiredQuantity, scannedQuantity }) {
    if (scannedQuantity <= 0) {
      return "PENDING";
    }

    if (scannedQuantity >= requiredQuantity) {
      return "DISPATCHED";
    }

    return "IN_PROGRESS";
  }

  // Invoices distinguish the some-but-not-all state as PARTIALLY_DISPATCHED
  // (a large order dispatched in sub-batches, or an order re-opened by a return),
  // whereas the dispatch row itself keeps the IN_PROGRESS working state.
  function calculateInvoiceStatus({ requiredQuantity, scannedQuantity }) {
    if (scannedQuantity <= 0) {
      return "PENDING";
    }

    if (scannedQuantity >= requiredQuantity) {
      return "DISPATCHED";
    }

    return "PARTIALLY_DISPATCHED";
  }

  return {
    calculateStatus,
    calculateInvoiceStatus,

    canCompleteDispatch({ requiredQuantity, scannedQuantity }) {
      const status = calculateStatus({ requiredQuantity, scannedQuantity });

      if (status === "DISPATCHED") {
        return { allowed: true, status, reason: null };
      }

      if (allowIncompleteCompletion) {
        return { allowed: true, status, reason: null };
      }

      return {
        allowed: false,
        status,
        reason: "INCOMPLETE_DISPATCH"
      };
    },

    async getInvoiceStatus({ invoiceId, repositories }) {
      const invoice = await repositories.invoices.findById(invoiceId);

      if (!invoice) {
        return null;
      }

      const requiredQuantity = invoice.lines.reduce((total, line) => total + line.quantity, 0);
      const scannedQuantity = await repositories.dispatches.countScansForInvoice(invoiceId);
      const committedQuantity = repositories.batteryPreBilling?.countCommitsForInvoice
        ? await repositories.batteryPreBilling.countCommitsForInvoice(invoiceId)
        : 0;

      return {
        invoiceId,
        status: calculateInvoiceStatus({ requiredQuantity, scannedQuantity }),
        requiredQuantity,
        scannedQuantity,
        committedQuantity
      };
    }
  };
}
