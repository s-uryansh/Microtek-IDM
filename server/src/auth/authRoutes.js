import { Router } from "express";
import cookie from "cookie";

import { sendError } from "../http/errorResponse.js";
import { loginSchema } from "../models/authSchemas.js";

const AUTH_COOKIE_NAME = "idm_auth";

function getToken(request) {
  const cookies = cookie.parse(request.headers.cookie || "");
  return cookies[AUTH_COOKIE_NAME] || null;
}

function setAuthCookie(response, token, { secure = false, expires } = {}) {
  response.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires,
    path: "/"
  });
}

function clearAuthCookie(response, { secure = false } = {}) {
  response.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/"
  });
}

function sendAuthError(response, error) {
  sendError(response, error.status || 500, error.code || "AUTH_ERROR", error.message || "Authentication failed");
}

function getClientIp(request) {
  return request.ip || request.socket?.remoteAddress || "unknown";
}

export function createAuthRoutes({ authService, loginRateLimiter, cookieOptions = {} }) {
  const router = Router();

  const limiterMiddleware = async (request, response, next) => {
    if (!loginRateLimiter?.check) {
      if (typeof loginRateLimiter === "function") {
        loginRateLimiter(request, response, next);
        return;
      }

      next();
      return;
    }

    try {
      const result = await loginRateLimiter.check(getClientIp(request));
      if (!result.allowed) {
        sendError(response, 429, "RATE_LIMITED", "Too many login attempts. Try again later.");
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  router.post("/login", limiterMiddleware, async (request, response, next) => {
    try {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "INVALID_REQUEST", "Username and password are required");
        return;
      }

      const result = await authService.login({
        username: parsed.data.username,
        password: parsed.data.password,
        ipAddress: request.ip,
        userAgent: request.get("user-agent")
      });
      await loginRateLimiter?.reset?.(getClientIp(request));
      setAuthCookie(response, result.token, { ...cookieOptions, expires: result.expiresAt });
      response.status(200).json({ user: result.user });
    } catch (error) {
      if (error.status) {
        sendAuthError(response, error);
        return;
      }
      next(error);
    }
  });

  router.get("/me", async (request, response) => {
    try {
      const user = await authService.authenticateToken(getToken(request));
      response.status(200).json({ user });
    } catch (error) {
      sendAuthError(response, error);
    }
  });

  router.post("/logout", async (request, response) => {
    await authService.logout(getToken(request));
    clearAuthCookie(response, cookieOptions);
    response.status(204).end();
  });

  return router;
}

export { AUTH_COOKIE_NAME, getToken };
