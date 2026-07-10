export async function createReceiptException(repositories, { serialNo, ruleCode, grnId, userId }) {
  if (!repositories.exceptionsRepo) {
    return null;
  }

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

export function invalidReceipt(ruleCode, message, exception = null) {
  return {
    valid: false,
    matchStatus: ruleCode,
    alert: { ruleCode, message },
    exception
  };
}
