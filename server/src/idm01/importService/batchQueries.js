export function mapBatchRow(batch) {
  return {
    batchId: batch.batchId,
    sourceLabel: batch.sourceLabel,
    importedAt: batch.finishedAt || batch.createdAt,
    importedCount: batch.recordCount,
    rejectedCount: 0,
    status: batch.status
  };
}

export async function listBatches(repositories, { limit = 20, offset = 0, sourceLabel }) {
  const result = await repositories.integrationBatches.listBatches({ limit, offset, sourceLabel });

  return {
    batches: result.batches.map(mapBatchRow),
    total: result.total,
    limit: result.limit,
    offset: result.offset
  };
}

export async function getBatch(repositories, batchId) {
  const batch = await repositories.integrationBatches.getBatch(batchId);

  if (!batch) return null;

  return {
    ...mapBatchRow(batch),
    rejections: batch.rejections.map((r) => ({
      index: r.rowIndex,
      serialNo: r.serialNo,
      reason: r.reason
    }))
  };
}
