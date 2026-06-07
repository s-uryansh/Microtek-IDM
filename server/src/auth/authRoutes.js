import { Router } from "express";
import cookie from "cookie";
import { z } from "zod";

const AUTH_COOKIE_NAME = "idm_auth";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256)
});

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
  response.status(error.status || 500).json({
    error: {
      code: error.code || "AUTH_ERROR",
      message: error.message || "Authentication failed"
    }
  });
}

export function createAuthRoutes({ authService, loginRateLimiter, cookieOptions = {} }) {
  const router = Router();

  router.post("/login", loginRateLimiter, async (request, response, next) => {
    try {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: { code: "INVALID_REQUEST", message: "Username and password are required" } });
        return;
      }

      const result = await authService.login({
        username: parsed.data.username,
        password: parsed.data.password,
        ipAddress: request.ip,
        userAgent: request.get("user-agent")
      });
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
