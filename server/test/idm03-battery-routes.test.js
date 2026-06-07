import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("../src/idm03/batteryPreBillingService.js", () => {
  const mockCommitSerial = vi.fn();
  const mockGetCommitStatus = vi.fn();
  const mockGetInvoiceWarehouseByLineId = vi.fn();
  return {
    createBatteryPreBillingService: () => ({
      commitSerial: mockCommitSerial,
      getCommitStatus: mockGetCommitStatus,
      getInvoiceWarehouseByLineId: mockGetInvoiceWarehouseByLineId
    }),
    __mockCommit: mockCommitSerial,
    __mockStatus: mockGetCommitStatus,
    __mockWarehouse: mockGetInvoiceWarehouseByLineId
  };
});

vi.mock("../src/http/authContext.js", () => ({
  requireAuthContext: (req, res, next) => {
    req.auth = { userId: "test_user", role: "supervisor", warehouseIds: [3] };
    next();
  },
  requirePermission: () => (req, res, next) => next()
}));

import express from "express";
import request from "supertest";
import { createBatteryPreBillingRoutes } from "../src/idm03/batteryPreBillingRoutes.js";

const mockCommit = (await import("../src/idm03/batteryPreBillingService.js")).__mockCommit;
const mockStatus = (await import("../src/idm03/batteryPreBillingService.js")).__mockStatus;
const mockWarehouse = (await import("../src/idm03/batteryPreBillingService.js")).__mockWarehouse;

function makeApp() {
  const service = {
    commitSerial: mockCommit,
    getCommitStatus: mockStatus,
    getInvoiceWarehouseByLineId: mockWarehouse
  };
  const app = express();
  app.use(express.json());
  const router = createBatteryPreBillingRoutes({ batteryPreBillingService: service });
  app.use("/api/idm-03", router);
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

describe("IDM-03 battery pre-billing routes", () => {
  beforeEach(() => {
    mockCommit.mockReset();
    mockStatus.mockReset();
    mockWarehouse.mockReset();
    mockWarehouse.mockResolvedValue(3);
  });

  test("POST /api/idm-03/battery/commit returns 200 on success", async () => {
    mockCommit.mockResolvedValue({ valid: true, status: "COMMITTED" });
    const app = makeApp();

    const res = await request(app)
      .post("/api/idm-03/battery/commit")
      .send({ invoiceLineId: 10, serialNo: "MTK-BAT-001" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMMITTED");
    expect(mockCommit).toHaveBeenCalledWith({
      invoiceLineId: 10,
      serialNo: "MTK-BAT-001",
      userId: "test_user"
    });
  });

  test("POST /api/idm-03/battery/commit returns 200 on invalid commit", async () => {
    mockCommit.mockResolvedValue({ valid: false, alert: { ruleCode: "ALREADY_COMMITTED", message: "Already committed" } });
    const app = makeApp();

    const res = await request(app)
      .post("/api/idm-03/battery/commit")
      .send({ invoiceLineId: 10, serialNo: "MTK-BAT-001" });

    expect(res.status).toBe(200);
    expect(res.body.alert.ruleCode).toBe("ALREADY_COMMITTED");
  });

  test("POST /api/idm-03/battery/commit returns 403 when warehouse not in scope", async () => {
    mockWarehouse.mockResolvedValue(5);
    const app = makeApp();

    const res = await request(app)
      .post("/api/idm-03/battery/commit")
      .send({ invoiceLineId: 10, serialNo: "MTK-BAT-001" });

    expect(res.status).toBe(403);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test("POST /api/idm-03/battery/commit returns 400 when fields missing", async () => {
    const app = makeApp();

    const res = await request(app)
      .post("/api/idm-03/battery/commit")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("GET /api/idm-03/battery/invoices/:invoiceId/status returns 200", async () => {
    mockStatus.mockResolvedValue({ invoiceId: 100, committedQuantity: 2 });
    const app = makeApp();

    const res = await request(app).get("/api/idm-03/battery/invoices/100/status");

    expect(res.status).toBe(200);
    expect(res.body.committedQuantity).toBe(2);
    expect(mockStatus).toHaveBeenCalledWith({ invoiceId: 100 });
  });

  test("GET /api/idm-03/battery/invoices/:invoiceId/status returns 400 for invalid id", async () => {
    const app = makeApp();

    const res = await request(app).get("/api/idm-03/battery/invoices/abc/status");

    expect(res.status).toBe(400);
  });
});
