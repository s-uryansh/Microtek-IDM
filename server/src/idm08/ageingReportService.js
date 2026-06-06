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
      const rows = await repositories.ageingReports.findOnHandSerials(filters);
      const summaryByBucket = new Map();
      let missingReceivedAtCount = 0;

      for (const row of rows) {
        const bucket = bucketService.bucketForAgeDays(row.missingReceivedAt ? null : row.ageDays);

        if (bucket.code === "MISSING_RECEIVED_AT") {
          missingReceivedAtCount += 1;
        }

        addToSummary(summaryByBucket, bucket);
      }

      return {
        filters,
        summary: Array.from(summaryByBucket.values()),
        dataQuality: {
          missingReceivedAtCount
        }
      };
    }
  };
}
