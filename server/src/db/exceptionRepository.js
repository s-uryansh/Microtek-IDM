export function createExceptionRepository(pool) {
  return {
    async createException({ serialNo, ruleCode, contextType, contextId, batchId, raisedBy, createdBy }) {
      const result = await pool.query(
        `INSERT INTO exception_log (
           serial_no,
           rule_code,
           context_type,
           context_id,
           batch_id,
           raised_by,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING
           exception_id AS "exceptionId",
           rule_code AS "ruleCode",
           status`,
        [serialNo ?? null, ruleCode, contextType, contextId ?? null, batchId ?? null, raisedBy, createdBy]
      );

      return result.rows[0];
    }
  };
}
