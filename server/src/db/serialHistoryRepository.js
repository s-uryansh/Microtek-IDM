export function createSerialHistoryRepository(pool) {
  return {
    async findBySerialNo(serialNo) {
      const serialResult = await pool.query(
        `SELECT serial_id AS "serialId", serial_no AS "serialNo", current_status AS "currentStatus"
         FROM serial_master
         WHERE serial_no = $1`,
        [serialNo]
      );
      const serial = serialResult.rows[0];

      if (!serial) {
        return null;
      }

      const events = await pool.query(
        `SELECT
           event_type AS "eventType",
           warehouse_id AS "warehouseId",
           reference_type AS "referenceType",
           reference_id AS "referenceId",
           event_at AS "eventAt",
           created_by AS "createdBy"
         FROM serial_event
         WHERE serial_id = $1
         ORDER BY event_at, event_id`,
        [serial.serialId]
      );
      const exceptions = await pool.query(
        `SELECT
           rule_code AS "ruleCode",
           context_type AS "contextType",
           context_id AS "contextId",
           status,
           raised_at AS "raisedAt",
           raised_by AS "raisedBy",
           corrected_at AS "correctedAt",
           corrected_by AS "correctedBy"
         FROM exception_log
         WHERE serial_no = $1
         ORDER BY raised_at, exception_id`,
        [serialNo]
      );

      return { serial, events: events.rows, exceptions: exceptions.rows };
    }
  };
}
