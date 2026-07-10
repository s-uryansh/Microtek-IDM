// Pure/stateless helpers for dispatchService.js — no closure over repositories or
// fulfilmentStatusService, extracted mechanically to keep the service factory file
// under the line-count ceiling. Behavior, error codes, and control flow are unchanged
// from the original single-file implementation.

export function requiredQuantity(lines) {
  return lines.reduce((total, line) => total + Number(line.quantity), 0);
}

export function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function productIdsForInvoice(invoice) {
  return [...new Set(invoice.lines.map((line) => Number(line.productId)))];
}

export function invalidScan(ruleCode, message) {
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

export async function recordDispatchException(repositories, { serialNo, ruleCode, dispatchId, userId }) {
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

export function invalidScanWithException(ruleCode, message, exception) {
  return {
    ...invalidScan(ruleCode, message),
    exception
  };
}

export function formatCompletedSerialRow(row) {
  return {
    serialNo: row.serialNo,
    productCode: row.productCode,
    warehouseId: Number(row.warehouseId)
  };
}

export function lineCapResolver(dispatch) {
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

export async function findAvailableLine(txRepositories, dispatch, serialProductId) {
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

export function invoiceStatusFor({ invoiceRequiredQuantity, scannedQuantity }) {
  if (scannedQuantity >= invoiceRequiredQuantity) {
    return "DISPATCHED";
  }
  if (scannedQuantity <= 0) {
    return "PENDING";
  }
  return "PARTIALLY_DISPATCHED";
}
