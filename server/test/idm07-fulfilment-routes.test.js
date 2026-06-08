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
          return invoice ? { invoiceId: invoice.invoiceId, warehouseId: invoice.warehouseId, status: "PENDING" } : null;
        }
      },
      repositories: {}
    })
  );
  return app;
}

describe("IDM-07 fulfilment routes", () => {
  test("denies invoice status outside caller warehouse scope", async () => {
    const app = makeApp({ invoice: { invoiceId: 100, warehouseId: 5 } });

    const res = await request(app).get("/api/idm-07/orders/100/status");

    expect(res.status).toBe(403);
  });

  test("allows invoice status inside caller warehouse scope", async () => {
    const app = makeApp({ invoice: { invoiceId: 100, warehouseId: 3 } });

    const res = await request(app).get("/api/idm-07/orders/100/status");

    expect(res.status).toBe(200);
    expect(res.body.warehouseId).toBe(3);
  });
});
