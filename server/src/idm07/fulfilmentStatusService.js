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

  return {
    calculateStatus,

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

      return {
        invoiceId,
        status: calculateStatus({ requiredQuantity, scannedQuantity }),
        requiredQuantity,
        scannedQuantity
      };
    }
  };
}
