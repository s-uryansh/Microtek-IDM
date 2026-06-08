import { describe, expect, test } from "vitest";

import { createReconciliationService } from "../src/idm08/reconciliationService.js";

describe("createReconciliationService", () => {
  test("delegates to the repository with the warehouse and product scope", async () => {
    const calls = [];
    const repositories = {
      reconciliationReports: {
        async findLatestOpeningStockVariance(input) {
          calls.push(input);
          return { variance: 12, productId: input.productId };
        }
      }
    };
    const service = createReconciliationService({ repositories });

    const result = await service.getOpeningStockVariance({ warehouseIds: [1, 2], productId: 9 });

    expect(result).toEqual({ variance: 12, productId: 9 });
    expect(calls).toEqual([{ warehouseIds: [1, 2], productId: 9 }]);
  });

  test("propagates repository errors", async () => {
    const repositories = {
      reconciliationReports: {
        async findLatestOpeningStockVariance() {
          throw new Error("db down");
        }
      }
    };
    const service = createReconciliationService({ repositories });
    await expect(
      service.getOpeningStockVariance({ warehouseIds: [1], productId: 1 })
    ).rejects.toThrow("db down");
  });
});
