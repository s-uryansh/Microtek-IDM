import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createSerialHistoryRoutes } from "../src/idm09/serialHistoryRoutes.js";

vi.mock("../src/http/authContext.js", () => ({
  requireAuthContext: (req, _res, next) => {
    req.auth = { userId: "supervisor_1", role: "supervisor", warehouseIds: [3] };
    next();
  },
  requirePermission: () => (_req, _res, next) => next()
}));

function makeApp(result) {
  const app = express();
  app.use(
    "/api/idm-09",
    createSerialHistoryRoutes({
      serialHistoryService: {
        async getSerialHistory() {
          return result;
        }
      }
    })
  );
  return app;
}

describe("IDM-09 serial history routes", () => {
  test("denies serial history outside caller warehouse scope", async () => {
    const app = makeApp({
      found: true,
      serial: { serialNo: "MTK1234567890" },
      warehouseIds: [5],
      timeline: []
    });

    const res = await request(app).get("/api/idm-09/serials/MTK1234567890/history");

    expect(res.status).toBe(403);
  });

  test("allows serial history inside caller warehouse scope", async () => {
    const app = makeApp({
      found: true,
      serial: { serialNo: "MTK1234567890" },
      warehouseIds: [3],
      timeline: []
    });

    const res = await request(app).get("/api/idm-09/serials/MTK1234567890/history");

    expect(res.status).toBe(200);
  });
});
