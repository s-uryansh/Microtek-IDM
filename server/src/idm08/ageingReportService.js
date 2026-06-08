import { z } from "zod";

const ageingReportSchema = z.object({
  warehouseIds: z.array(z.number().int().positive()).min(1),
  productId: z.number().int().positive().optional(),
  limit: z.number().int().nonnegative().max(200).default(50),
  offset: z.number().int().nonnegative().default(0)
});

function addToSummary(summaryByBucket, bucket) {
  const existing = summaryByBucket.get(bucket.code);

  if (existing) {
    existing.quantity += 1;
    return;
  }

  summaryByBucket.set(bucket.code, {
    bucketCode: bucket.code,
    label: bucket.label,
    quantity: 1
  });
}

export function createAgeingReportService({ repositories, bucketService }) {
  return {
    async getAgeingReport(filters) {
      const parsed = ageingReportSchema.parse(filters);
      const result = await repositories.ageingReports.findOnHandSerials(parsed);
      const rows = Array.isArray(result) ? result : result.rows;
      const total = Array.isArray(result) ? result.length : result.total;
      const summaryByBucket = new Map();
      let missingReceivedAtCount = 0;
      const data = [];

      for (const row of rows) {
        const bucket = bucketService.bucketForAgeDays(row.missingReceivedAt ? null : row.ageDays);

        if (bucket.code === "MISSING_RECEIVED_AT") {
          missingReceivedAtCount += 1;
        }

        addToSummary(summaryByBucket, bucket);
        data.push({
          ...row,
          bucketCode: bucket.code,
          bucketLabel: bucket.label
        });
      }

      return {
        filters: {
          warehouseIds: parsed.warehouseIds,
          productId: parsed.productId
        },
        summary: Array.from(summaryByBucket.values()),
        dataQuality: {
          missingReceivedAtCount
        },
        data,
        pagination: {
          limit: parsed.limit,
          offset: parsed.offset,
          total
        }
      };
    }
  };
}
