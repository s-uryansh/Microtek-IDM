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

    async createPending({ direction, payloadType, externalRef, sourceSystem, createdBy, sourceLabel }) {
      const result = await pool.query(
        `INSERT INTO integration_batch (
           direction,
           payload_type,
           external_ref,
           source_system,
           created_by,
           source_label
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (direction, payload_type, external_ref) DO NOTHING
         RETURNING
           batch_id AS "batchId",
           direction,
           payload_type AS "payloadType",
           external_ref AS "externalRef",
           status,
           source_label AS "sourceLabel"`,
        [direction, payloadType, externalRef, sourceSystem, createdBy, sourceLabel ?? null]
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
    },

    async listBatches({ limit = 20, offset = 0, sourceLabel } = {}) {
      const conditions = ["1 = 1"];
      const values = [];

      if (sourceLabel) {
        conditions.push(`source_label = $${values.length + 1}`);
        values.push(sourceLabel);
      }

      const whereClause = conditions.join(" AND ");
      const limitIndex = values.length + 1;
      const offsetIndex = values.length + 2;

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS "total"
         FROM integration_batch
         WHERE ${whereClause}`,
        values
      );

      const result = await pool.query(
        `SELECT
           b.batch_id AS "batchId",
           b.direction,
           b.payload_type AS "payloadType",
           b.external_ref AS "externalRef",
           b.source_system AS "sourceSystem",
           b.source_label AS "sourceLabel",
           b.record_count AS "recordCount",
           b.status,
           b.started_at AS "startedAt",
           b.finished_at AS "finishedAt",
           b.created_at AS "createdAt",
           b.created_by AS "createdBy",
           COALESCE(r.rejected_count, 0) AS "rejectedCount"
         FROM integration_batch b
         LEFT JOIN (
           SELECT batch_id, COUNT(*)::int AS rejected_count
           FROM integration_batch_rejection
           GROUP BY batch_id
         ) r ON r.batch_id = b.batch_id
         WHERE ${whereClause}
         ORDER BY b.created_at DESC
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...values, limit, offset]
      );

      return {
        batches: result.rows,
        total: countResult.rows[0].total,
        limit,
        offset
      };
    },

    async getBatch(batchId) {
      const batchResult = await pool.query(
        `SELECT
           batch_id AS "batchId",
           direction,
           payload_type AS "payloadType",
           external_ref AS "externalRef",
           source_system AS "sourceSystem",
           source_label AS "sourceLabel",
           record_count AS "recordCount",
           status,
           error_detail AS "errorDetail",
           started_at AS "startedAt",
           finished_at AS "finishedAt",
           created_at AS "createdAt",
           created_by AS "createdBy"
         FROM integration_batch
         WHERE batch_id = $1`,
        [batchId]
      );

      const batch = batchResult.rows[0] ?? null;
      if (!batch) return null;

      const rejectionsResult = await pool.query(
        `SELECT
           rejection_id AS "rejectionId",
           row_index AS "rowIndex",
           serial_no AS "serialNo",
           reason
         FROM integration_batch_rejection
         WHERE batch_id = $1
         ORDER BY row_index`,
        [batchId]
      );

      return {
        ...batch,
        rejections: rejectionsResult.rows
      };
    },

    async storeRejections(batchId, rejections) {
      if (!rejections || rejections.length === 0) return;

      const values = [];
      const placeholders = [];

      for (let i = 0; i < rejections.length; i++) {
        const r = rejections[i];
        const base = i * 4;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        values.push(batchId, r.index, r.serialNo, r.reason);
      }

      await pool.query(
        `INSERT INTO integration_batch_rejection (batch_id, row_index, serial_no, reason)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (batch_id, row_index) DO NOTHING`,
        values
      );
    }
  };
}
