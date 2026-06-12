import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createLookupRoutes } from "../src/lookups/lookupRoutes.js";

vi.mock("../src/http/authContext.js", () => ({
  requireAuthContext: (req, _res, next) => {
    req.auth = { userId: "operator_1", role: "warehouse_operator", warehouseIds: [3] };
    next();
  },
  requirePermission: () => (_req, _res, next) => next()
}));

function makeApp(lookupService) {
  const service = {
    scopedWarehouses({ requestedWarehouseId, userWarehouseIds }) {
      if (!requestedWarehouseId) return userWarehouseIds;
      return userWarehouseIds.includes(requestedWarehouseId) ? [requestedWarehouseId] : null;
    },
    ...lookupService
  };
  const app = express();
  app.use((req, _res, next) => {
    req.rbacPolicy = { can: () => true };
    next();
  });
  app.use("/api/lookups", createLookupRoutes({ lookupService: service }));
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe("lookup routes", () => {
  test("lists invoices with lines (not warehouse-scoped)", async () => {
    const app = makeApp({
      async searchInvoices(input) {
        // Invoices are warehouse-agnostic — no warehouseIds are passed through.
        expect(input).toMatchObject({ query: "INV", batteryOnly: false });
        expect(input.warehouseIds).toBeUndefined();
        return [{ invoiceId: 10, sapInvoiceRef: "INV-10", lines: [] }];
      }
    });

    const res = await request(app).get("/api/lookups/invoices?query=INV");

    expect(res.status).toBe(200);
    expect(res.body.items[0].sapInvoiceRef).toBe("INV-10");
  });

  test("invoice lookup ignores any warehouse scope and still returns results", async () => {
    const app = makeApp({
      async searchInvoices() {
        return [{ invoiceId: 11, sapInvoiceRef: "INV-11", lines: [] }];
      }
    });

    // A warehouse outside the operator's scope must not block an invoice lookup.
    const res = await request(app).get("/api/lookups/invoices?warehouseId=5");

    expect(res.status).toBe(200);
    expect(res.body.items[0].sapInvoiceRef).toBe("INV-11");
  });

  test("lists scoped SAP dispatch documents", async () => {
    const app = makeApp({
      async searchDispatchDocs(input) {
        expect(input).toMatchObject({ query: "DOC", warehouseIds: [3] });
        return [{ sapDispatchDocId: 20, externalRef: "DOC-20", destinationWarehouseId: 3, lines: [] }];
      }
    });

    const res = await request(app).get("/api/lookups/dispatch-docs?query=DOC");

    expect(res.status).toBe(200);
    expect(res.body.items[0].externalRef).toBe("DOC-20");
  });
});
