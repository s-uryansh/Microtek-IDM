import { describe, expect, test } from "vitest";

import { createLookupService } from "../src/lookups/lookupService.js";

function createService(calls = {}) {
  const recorded = { searchInvoices: [], searchDispatchDocs: [], searchDispatches: [], searchWarehouses: [] };
  const repositories = {
    lookups: {
      async searchInvoices(input) {
        recorded.searchInvoices.push(input);
        return calls.searchInvoices ?? [];
      },
      async searchDispatchDocs(input) {
        recorded.searchDispatchDocs.push(input);
        return calls.searchDispatchDocs ?? [];
      },
      async searchDispatches(input) {
        recorded.searchDispatches.push(input);
        return calls.searchDispatches ?? [];
      },
      async searchWarehouses(input) {
        recorded.searchWarehouses.push(input);
        return calls.searchWarehouses ?? [];
      }
    }
  };
  return { service: createLookupService({ repositories }), recorded };
}

describe("createLookupService", () => {
  describe("scopedWarehouses (warehouse-scope authorization)", () => {
    test("admin with a requested warehouse is scoped to just that warehouse", () => {
      const { service } = createService();
      expect(
        service.scopedWarehouses({ requestedWarehouseId: 7, userWarehouseIds: [1, 2], role: "admin" })
      ).toEqual([7]);
    });

    test("admin without a requested warehouse sees all of their warehouses", () => {
      const { service } = createService();
      expect(
        service.scopedWarehouses({ requestedWarehouseId: undefined, userWarehouseIds: [1, 2], role: "admin" })
      ).toEqual([1, 2]);
    });

    test("non-admin without a requested warehouse is scoped to their own warehouses", () => {
      const { service } = createService();
      expect(
        service.scopedWarehouses({ requestedWarehouseId: null, userWarehouseIds: [3, 4], role: "operator" })
      ).toEqual([3, 4]);
    });

    test("non-admin requesting a warehouse they own is scoped to it", () => {
      const { service } = createService();
      expect(
        service.scopedWarehouses({ requestedWarehouseId: 4, userWarehouseIds: [3, 4], role: "operator" })
      ).toEqual([4]);
    });

    test("non-admin requesting a warehouse they do NOT own is denied (null)", () => {
      const { service } = createService();
      expect(
        service.scopedWarehouses({ requestedWarehouseId: 99, userWarehouseIds: [3, 4], role: "operator" })
      ).toBeNull();
    });
  });

  describe("search passthroughs", () => {
    test("searchInvoices delegates to the repository with the same input", async () => {
      const { service, recorded } = createService({ searchInvoices: [{ invoiceId: 1 }] });
      const input = { query: "INV", warehouseIds: [1] };
      const result = await service.searchInvoices(input);
      expect(result).toEqual([{ invoiceId: 1 }]);
      expect(recorded.searchInvoices).toEqual([input]);
    });

    test("searchWarehouses delegates to the repository", async () => {
      const { service, recorded } = createService();
      await service.searchWarehouses({ query: "WH" });
      expect(recorded.searchWarehouses).toEqual([{ query: "WH" }]);
    });
  });
});
