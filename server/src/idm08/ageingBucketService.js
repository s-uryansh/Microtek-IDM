const missingReceivedAtBucket = {
  code: "MISSING_RECEIVED_AT",
  label: "Missing receipt date",
  dataQualityIssue: true
};

export const defaultAgeingBuckets = [
  { code: "B0_30", label: "0-30", minDays: 0, maxDays: 30 },
  { code: "B31_60", label: "31-60", minDays: 31, maxDays: 60 },
  { code: "B61_90", label: "61-90", minDays: 61, maxDays: 90 },
  { code: "B91_PLUS", label: "91+", minDays: 91, maxDays: null }
];

export function createAgeingBucketService({ buckets = defaultAgeingBuckets } = {}) {
  return {
    buckets,

    bucketForAgeDays(ageDays) {
      if (ageDays === null || ageDays === undefined) {
        return missingReceivedAtBucket;
      }

      const bucket = buckets.find((candidate) => {
        const withinMin = ageDays >= candidate.minDays;
        const withinMax = candidate.maxDays === null || ageDays <= candidate.maxDays;
        return withinMin && withinMax;
      });

      if (!bucket) {
        return {
          code: "UNBUCKETED",
          label: "Unbucketed",
          dataQualityIssue: true
        };
      }

      return bucket;
    }
  };
}
