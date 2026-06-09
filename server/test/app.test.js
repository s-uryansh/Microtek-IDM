import { createRequest, createResponse } from "node-mocks-http";
import { describe, expect, test } from "vitest";
import request from "supertest";

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

  test("allows credentialed CORS preflight requests from the frontend origin", async () => {
    const response = await request(createApp({ config }))
      .options("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("does not reflect unconfigured CORS origins", async () => {
    const response = await request(createApp({ config }))
      .options("/api/auth/login")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
  });

  async function injectWithHeaders(app, { method, url, headers = {} }) {
    const httpRequest = createRequest({ method, url, headers });
    const response = createResponse();
    app.handle(httpRequest, response);
    await new Promise((resolve) => setImmediate(resolve));
    return {
      status: response.statusCode,
      body: response._getData() ? response._getJSONData() : null
    };
  }

  test("rejects unauthenticated access to /api/metrics", async () => {
    const response = await injectWithHeaders(createApp({ config }), { method: "GET", url: "/api/metrics" });
    expect(response.status).toBe(401);
  });

  test("rejects non-admin access to /api/metrics", async () => {
    const response = await injectWithHeaders(createApp({ config }), {
      method: "GET",
      url: "/api/metrics",
      headers: { "x-user-id": "supervisor_1", "x-user-role": "supervisor", "x-warehouse-ids": "4" }
    });
    expect(response.status).toBe(403);
  });

  test("allows an admin to read /api/metrics", async () => {
    const response = await injectWithHeaders(createApp({ config }), {
      method: "GET",
      url: "/api/metrics",
      headers: { "x-user-id": "admin_1", "x-user-role": "admin" }
    });
    expect(response.status).toBe(200);
    expect(typeof response.body).toBe("object");
  });
});
