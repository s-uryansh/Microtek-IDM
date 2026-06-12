import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createFulfilmentStatusRoutes } from "../src/idm07/fulfilmentStatusRoutes.js";

vi.mock("../src/http/authContext.js", () => ({
  requireAuthContext: (req, _res, next) => {
    req.auth = { userId: "operator_1", role: "warehouse_operator", warehouseIds: [3] };
    next();
  },
  requirePermission: () => (_req, _res, next) => next()
}));

function makeApp({ invoice }) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/idm-07",
    createFulfilmentStatusRoutes({
      fulfilmentStatusService: {
        async getInvoiceStatus() {
          return invoice ? { invoiceId: invoice.invoiceId, status: "PENDING" } : null;
        }
      },
      repositories: {}
    })
  );
  return app;
}

describe("IDM-07 fulfilment routes", () => {
  test("returns fulfilment status for a permitted caller (not warehouse-scoped)", async () => {
    // Invoices carry no warehouse, so fulfilment status is gated by the
    // fulfilment:read permission only — any permitted role sees it.
    const app = makeApp({ invoice: { invoiceId: 100 } });

    const res = await request(app).get("/api/idm-07/orders/100/status");

    expect(res.status).toBe(200);
    expect(res.body.invoiceId).toBe(100);
  });

  test("returns 404 when the invoice has no fulfilment record", async () => {
    const app = makeApp({ invoice: null });

    const res = await request(app).get("/api/idm-07/orders/100/status");

    expect(res.status).toBe(404);
  });
});
