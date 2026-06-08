function toTime(value) {
  return new Date(value).getTime();
}

export function createSerialHistoryService({ repositories }) {
  return {
    async getSerialHistory({ serialNo }) {
      const history = await repositories.serialHistories.findBySerialNo(serialNo);

      if (!history) {
        return {
          found: false,
          serial: null,
          timeline: []
        };
      }

      const events = history.events.map((event) => ({
        type: "EVENT",
        at: event.eventAt,
        eventType: event.eventType,
        warehouseId: event.warehouseId,
        referenceType: event.referenceType,
        referenceId: event.referenceId,
        createdBy: event.createdBy
      }));
      const exceptions = history.exceptions.map((exception) => ({
        type: "EXCEPTION",
        at: exception.raisedAt,
        ruleCode: exception.ruleCode,
        contextType: exception.contextType,
        contextId: exception.contextId,
        status: exception.status,
        raisedBy: exception.raisedBy,
        correctedAt: exception.correctedAt,
        correctedBy: exception.correctedBy
      }));
      const warehouseIds = [
        history.serial.currentWarehouseId,
        ...history.events.map((event) => event.warehouseId)
      ].filter((warehouseId, index, values) => warehouseId && values.indexOf(warehouseId) === index);

      return {
        found: true,
        serial: history.serial,
        warehouseIds,
        timeline: [...events, ...exceptions].sort((left, right) => toTime(left.at) - toTime(right.at))
      };
    }
  };
}
