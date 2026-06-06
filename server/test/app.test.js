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

describe("Express foundation", () => {
  async function inject(app, { method, url }) {
    const request = createRequest({ method, url });
    const response = createResponse();

    app.handle(request, response);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    return {
      status: response.statusCode,
      body: response._getJSONData()
    };
  }

  test("returns a minimal health response", async () => {
    const response = await inject(createApp({ config }), { method: "GET", url: "/health" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "microtek-idm-api"
    });
  });

  test("does not expose stack traces for unknown routes", async () => {
    const response = await inject(createApp({ config }), { method: "GET", url: "/missing" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found"
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("Error:");
  });
});
