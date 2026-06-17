// Condition correction: lets an authorised user clear a serial off condition
// hold (e.g. retag DEFECTIVE/REPAIR back to SALEABLE after inspection/repair)
// so it can be dispatched again. The change is attributed and recorded as a
// CORRECTION serial event for audit. Stock business logic is untouched — only
// the condition tag and its audit trail are written.
export function createConditionCorrectionService({ repositories, conditionTagService }) {
  return {
    async listHeldStock({ warehouseIds } = {}) {
      return repositories.serials.findHeldStock({ warehouseIds });
    },

    async getSerialWarehouseId(serialNo) {
      const serial = await repositories.serials.findBySerialNo(serialNo);
      return serial ? serial.currentWarehouseId : null;
    },

    async correctConditionTag({ serialNo, conditionTag, userId }) {
      if (!conditionTagService.isAllowed(conditionTag)) {
        return { ok: false, code: "INVALID_CONDITION_TAG", message: "Condition tag is not allowed." };
      }

      const serial = await repositories.serials.findBySerialNo(serialNo);

      if (!serial) {
        return { ok: false, code: "NOT_FOUND", message: "Serial not found." };
      }

      return repositories.withTransaction(async (txRepositories) => {
        await txRepositories.serials.setConditionTag(serial.serialId, conditionTag, userId);
        await txRepositories.serials.appendSerialEvent({
          serialId: serial.serialId,
          eventType: "CORRECTION",
          warehouseId: serial.currentWarehouseId,
          referenceType: "CONDITION",
          referenceId: null,
          createdBy: userId
        });

        return {
          ok: true,
          serialId: serial.serialId,
          serialNo: serial.serialNo,
          conditionTag,
          warehouseId: serial.currentWarehouseId
        };
      });
    }
  };
}
