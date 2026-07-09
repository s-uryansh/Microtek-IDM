import { describe, expect, test } from "vitest";

import { createAgeingBucketService } from "../src/idm08/ageingBucketService.js";
import { createAgeingReportService } from "../src/idm08/ageingReportService.js";

function createRepositories(rows) {
  const calls = [];

  return {
    calls,
    ageingReports: {
      async findOnHandSerials(filters) {
        calls.push(filters);
        return rows;
      }
    }
  };
}

describe("IDM-08 ageing report service", () => {
  test.todo("T08-02: confirm final ageing bucket definitions and export shape after OI-8 closes");
  test.todo("T08-05: verify SAP ageing-feed retry behavior after outbound transport is authorized");

  test("summarises bucket totals using configurable buckets", async () => {
    const repositories = createRepositories([
      { serialId: 1, warehouseId: 5, productId: 10, ageDays: 10, missingReceivedAt: false },
      { serialId: 2, warehouseId: 5, productId: 10, ageDays: 35, missingReceivedAt: false },
      { serialId: 3, warehouseId: 5, productId: 10, ageDays: 80, missingReceivedAt: false }
    ]);
    const service = createAgeingReportService({
      repositories,
      bucketService: createAgeingBucketService({
        buckets: [
          { code: "B0_30", label: "0-30", minDays: 0, maxDays: 30 },
          { code: "B31_60", label: "31-60", minDays: 31, maxDays: 60 },
          { code: "B61_PLUS", label: "61+", minDays: 61, maxDays: null }
        ]
      })
    });

    const result = await service.getAgeingReport({
      warehouseIds: [5],
      productId: 10
    });

    expect(result.summary).toEqual([
      { bucketCode: "B0_30", label: "0-30", quantity: 1, totalValue: 0 },
      { bucketCode: "B31_60", label: "31-60", quantity: 1, totalValue: 0 },
      { bucketCode: "B61_PLUS", label: "61+", quantity: 1, totalValue: 0 }
    ]);
    expect(repositories.calls).toEqual([{ warehouseIds: [5], productId: 10, limit: 50, offset: 0 }]);
  });

  test("reports missing received_at as data quality issue", async () => {
    const repositories = createRepositories([
      { serialId: 1, warehouseId: 5, productId: 10, ageDays: null, missingReceivedAt: true }
    ]);
    const service = createAgeingReportService({
      repositories,
      bucketService: createAgeingBucketService({
        buckets: [{ code: "B0_30", label: "0-30", minDays: 0, maxDays: 30 }]
      })
    });

    const result = await service.getAgeingReport({
      warehouseIds: [5]
    });

    expect(result.summary).toEqual([
      { bucketCode: "MISSING_RECEIVED_AT", label: "Missing receipt date", quantity: 1, totalValue: 0 }
    ]);
    expect(result.dataQuality).toEqual({
      missingReceivedAtCount: 1
    });
  });
});
