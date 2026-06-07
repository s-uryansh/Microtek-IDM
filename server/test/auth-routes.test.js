import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createAuthRoutes } from "../src/auth/authRoutes.js";
import { createLoginRateLimiter } from "../src/auth/loginRateLimiter.js";

function makeApp({ authService, rateLimiter } = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/auth",
    createAuthRoutes({
      authService,
      loginRateLimiter: rateLimiter ?? ((_request, _response, next) => next()),
      cookieOptions: { secure: false }
    })
  );
  app.use((error, _request, response, _next) => {
    response.status(error.status || 500).json({ error: { code: error.code || "ERROR", message: error.message } });
  });
  return app;
}

describe("auth routes", () => {
  test("POST /api/auth/login sets an httpOnly auth cookie", async () => {
    const expiresAt = new Date(Date.now() + 3600000);
    const app = makeApp({
      authService: {
        login: vi.fn().mockResolvedValue({
          token: "token-1",
          expiresAt,
          user: { userId: "1", username: "admin", role: "admin", warehouseIds: [1, 2] }
        })
      }
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe("admin");
    expect(response.headers["set-cookie"][0]).toContain("idm_auth=token-1");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("Expires=");
  });

  test("POST /api/auth/login returns structured invalid credential errors", async () => {
    const app = makeApp({
      authService: {
        login: vi.fn().mockRejectedValue(Object.assign(new Error("Invalid username or password"), {
          code: "INVALID_CREDENTIALS",
          status: 401
        }))
      }
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrong" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("GET /api/auth/me returns current user from auth cookie", async () => {
    const app = makeApp({
      authService: {
        authenticateToken: vi.fn().mockResolvedValue({ userId: "1", username: "admin", role: "admin", warehouseIds: [1] })
      }
    });

    const response = await request(app).get("/api/auth/me").set("Cookie", "idm_auth=token-1");

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ userId: "1", username: "admin", role: "admin", warehouseIds: [1] });
  });

  test("GET /api/auth/me returns unauthorized for expired or revoked sessions", async () => {
    const app = makeApp({
      authService: {
        authenticateToken: vi.fn().mockRejectedValue(Object.assign(new Error("Authentication required"), {
          code: "UNAUTHORIZED",
          status: 401
        }))
      }
    });

    const response = await request(app).get("/api/auth/me").set("Cookie", "idm_auth=expired-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  test("POST /api/auth/logout revokes current session and clears cookie", async () => {
    const authService = {
      logout: vi.fn().mockResolvedValue()
    };
    const app = makeApp({ authService });

    const response = await request(app).post("/api/auth/logout").set("Cookie", "idm_auth=token-1");

    expect(response.status).toBe(204);
    expect(authService.logout).toHaveBeenCalledWith("token-1");
    expect(response.headers["set-cookie"][0]).toContain("idm_auth=;");
  });
});

describe("login rate limiter", () => {
  test("rate limits repeated login attempts by username and IP", async () => {
    const app = makeApp({
      rateLimiter: createLoginRateLimiter({ windowMs: 60000, maxAttempts: 2 }),
      authService: {
        login: vi.fn().mockRejectedValue(Object.assign(new Error("Invalid username or password"), {
          code: "INVALID_CREDENTIALS",
          status: 401
        }))
      }
    });

    await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" }).expect(401);
    await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" }).expect(401);
    const response = await request(app).post("/api/auth/login").send({ username: "admin", password: "wrong" });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});
