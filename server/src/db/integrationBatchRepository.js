export function createIntegrationBatchRepository(pool) {
  return {
    async findByKey({ direction, payloadType, externalRef }) {
      const result = await pool.query(
        `SELECT
           batch_id AS "batchId",
           direction,
           payload_type AS "payloadType",
           external_ref AS "externalRef",
           record_count AS "recordCount",
           status
         FROM integration_batch
         WHERE direction = $1 AND payload_type = $2 AND external_ref = $3`,
        [direction, payloadType, externalRef]
      );

      return result.rows[0] ?? null;
    },

    async createPending({ direction, payloadType, externalRef, sourceSystem, createdBy }) {
      const result = await pool.query(
        `INSERT INTO integration_batch (
           direction,
           payload_type,
           external_ref,
           source_system,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (direction, payload_type, external_ref) DO NOTHING
         RETURNING
           batch_id AS "batchId",
           direction,
           payload_type AS "payloadType",
           external_ref AS "externalRef",
           status`,
        [direction, payloadType, externalRef, sourceSystem, createdBy]
      );

      return result.rows[0] ?? this.findByKey({ direction, payloadType, externalRef });
    },

    async markProcessed(batchId, recordCount) {
      await pool.query(
        `UPDATE integration_batch
         SET status = 'PROCESSED',
             record_count = $2,
             finished_at = now(),
             updated_at = now(),
             updated_by = created_by
         WHERE batch_id = $1`,
        [batchId, recordCount]
      );
    },

    async markFailed(batchId, errorDetail) {
      await pool.query(
        `UPDATE integration_batch
         SET status = 'FAILED',
             error_detail = $2,
             finished_at = now(),
             updated_at = now(),
             updated_by = created_by
         WHERE batch_id = $1`,
        [batchId, errorDetail]
      );
    }
  };
}
