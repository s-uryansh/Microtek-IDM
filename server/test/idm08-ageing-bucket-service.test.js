import { describe, expect, test } from "vitest";

import { createAgeingBucketService } from "../src/idm08/ageingBucketService.js";

const buckets = [
  { code: "B0_30", label: "0-30", minDays: 0, maxDays: 30 },
  { code: "B31_60", label: "31-60", minDays: 31, maxDays: 60 },
  { code: "B61_PLUS", label: "61+", minDays: 61, maxDays: null }
];

describe("IDM-08 ageing bucket service", () => {
  test("assigns serials to configurable buckets", () => {
    const service = createAgeingBucketService({ buckets });

    expect(service.bucketForAgeDays(0)).toMatchObject({ code: "B0_30" });
    expect(service.bucketForAgeDays(45)).toMatchObject({ code: "B31_60" });
    expect(service.bucketForAgeDays(90)).toMatchObject({ code: "B61_PLUS" });
  });

  test("flags missing received_at as data quality instead of bucket silently", () => {
    const service = createAgeingBucketService({ buckets });

    expect(service.bucketForAgeDays(null)).toEqual({
      code: "MISSING_RECEIVED_AT",
      label: "Missing receipt date",
      dataQualityIssue: true
    });
  });
});
