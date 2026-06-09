const exceptionFields = `
  e.exception_id AS "exceptionId",
  e.serial_no AS "serialNo",
  e.rule_code AS "ruleCode",
  e.context_type AS "contextType",
  e.context_id AS "contextId",
  e.status,
  e.raised_at AS "raisedAt",
  e.raised_by AS "raisedBy",
  e.corrected_at AS "correctedAt",
  e.corrected_by AS "correctedBy",
  e.correction_reason AS "correctionReason",
  e.correction_txn_ref AS "correctionTxnRef",
  COALESCE(e.warehouse_id, g.receiving_warehouse_id, d.warehouse_id, s.receiving_warehouse_id) AS "warehouseId"
`;

// Resolved warehouse for scoping: prefer the warehouse_id persisted at
// creation time (the only reliable source for BATTERY/IMPORT/FOUNDATION
// contexts), falling back to the context-table joins for older rows.
const resolvedWarehouse = `COALESCE(e.warehouse_id, g.receiving_warehouse_id, d.warehouse_id, s.receiving_warehouse_id)`;

const warehouseJoin = `
  LEFT JOIN grn g ON g.grn_id = e.context_id AND e.context_type = 'GRN'
  LEFT JOIN dispatch d ON d.dispatch_id = e.context_id AND e.context_type = 'DISPATCH'
  LEFT JOIN srn s ON s.srn_id = e.context_id AND e.context_type = 'SRN'
`;

export function createExceptionRepository(pool) {
  return {
    async createException({ serialNo, ruleCode, contextType, contextId, batchId, warehouseId, raisedBy, createdBy }) {
      const result = await pool.query(
        `INSERT INTO exception_log (
           serial_no,
           rule_code,
           context_type,
           context_id,
           batch_id,
           warehouse_id,
           raised_by,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING
           exception_id AS "exceptionId",
           rule_code AS "ruleCode",
           status`,
        [serialNo ?? null, ruleCode, contextType, contextId ?? null, batchId ?? null, warehouseId ?? null, raisedBy, createdBy]
      );

      return result.rows[0];
    },

    async findById(exceptionId) {
      const result = await pool.query(
        `SELECT ${exceptionFields}
         FROM exception_log e
         ${warehouseJoin}
         WHERE e.exception_id = $1`,
        [exceptionId]
      );

      return result.rows[0] ?? null;
    },

    async findAll({ status, contextType, warehouseIds, limit, offset }) {
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (status) {
        conditions.push(`e.status = $${paramIndex++}`);
        values.push(status);
      }

      if (contextType) {
        conditions.push(`e.context_type = $${paramIndex++}`);
        values.push(contextType);
      }

      if (warehouseIds && warehouseIds.length > 0) {
        conditions.push(`${resolvedWarehouse} = ANY($${paramIndex++}::bigint[])`);
        values.push(warehouseIds);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM exception_log e
         ${warehouseJoin}
         ${whereClause}`,
        values
      );

      const dataResult = await pool.query(
        `SELECT ${exceptionFields}
         FROM exception_log e
         ${warehouseJoin}
         ${whereClause}
         ORDER BY e.raised_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset]
      );

      return {
        rows: dataResult.rows,
        total: countResult.rows[0].total
      };
    },

    async correctException({ exceptionId, correctionReason, correctedBy, correctionTxnRef }) {
      const result = await pool.query(
        `UPDATE exception_log
         SET status = 'CORRECTED',
             corrected_at = now(),
             corrected_by = $2,
             correction_reason = $3,
             correction_txn_ref = COALESCE($4, correction_txn_ref)
         WHERE exception_id = $1 AND status = 'OPEN'
         RETURNING
           exception_id AS "exceptionId",
           serial_no AS "serialNo",
           rule_code AS "ruleCode",
           context_type AS "contextType",
           context_id AS "contextId",
           status,
           raised_at AS "raisedAt",
           raised_by AS "raisedBy",
           corrected_at AS "correctedAt",
           corrected_by AS "correctedBy",
           correction_reason AS "correctionReason",
           correction_txn_ref AS "correctionTxnRef"`,
        [exceptionId, correctedBy, correctionReason, correctionTxnRef ?? null]
      );

      return result.rows[0] ?? null;
    }
  };
}
