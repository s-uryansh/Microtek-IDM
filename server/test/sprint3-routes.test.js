import { createRequest, createResponse } from "node-mocks-http";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";

const config = {
  nodeEnv: "test",
  port: 4100,
  databaseUrl: "postgres://user:pass@localhost:5432/microtek_idm_test",
  corsOrigin: "http://localhost:5173",
  logLevel: "silent"
};

async function inject(app, { method, url, headers = {} }) {
  const request = createRequest({ method, url, headers });
  const response = createResponse();
  app.handle(request, response);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    status: response.statusCode,
    body: response._getData() ? response._getJSONData() : null
  };
}

describe("Sprint 3 API authorization", () => {
  test("denies ageing report requests without authentication", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing?warehouseId=5"
    });

    expect(response.status).toBe(401);
  });

  test("denies ageing report requests outside caller warehouse scope", async () => {
    const app = createApp({ config });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing?warehouseId=5",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "4"
      }
    });

    expect(response.status).toBe(403);
  });

  test("returns report through injected service for authorized warehouse", async () => {
    const app = createApp({
      config,
      services: {
        ageingReportService: {
          async getAgeingReport(filters) {
            return {
              filters,
              summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 2 }],
              dataQuality: { missingReceivedAtCount: 0 }
            };
          }
        }
      }
    });

    const response = await inject(app, {
      method: "GET",
      url: "/api/idm-08/ageing?warehouseId=5&productId=10",
      headers: {
        "x-user-id": "supervisor_1",
        "x-user-role": "supervisor",
        "x-warehouse-ids": "5"
      }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      filters: { warehouseIds: [5], productId: 10 },
      summary: [{ bucketCode: "B0_30", label: "0-30", quantity: 2 }],
      dataQuality: { missingReceivedAtCount: 0 }
    });
  });
});
