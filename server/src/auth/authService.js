import { randomBytes } from "node:crypto";

import { authError, invalidCredentialsError } from "./authErrors.js";
import { verifyPassword } from "./password.js";
import { createSessionToken, verifySessionToken } from "./token.js";
import { staticPermissionsForRole } from "../security/rbacPolicy.js";

const DUMMY_HASH = "$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6";

function publicUser(user, permissions = []) {
  return {
    userId: String(user.userId),
    username: user.username,
    role: user.role,
    warehouseIds: user.warehouseIds,
    permissions: Array.isArray(permissions) ? permissions : []
  };
}

function isLocked(user, now = new Date()) {
  return user?.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime();
}

export function createAuthService({
  authRepository,
  tokenSecret,
  logger = console,
  sessionTtlSeconds = 8 * 60 * 60,
  maxFailedLogins = 5,
  lockoutMs = 15 * 60 * 1000,
  resolvePermissions = null
}) {
  // Resolve the permission codes granted to a user's role. Prefers the injected
  // (database-backed) resolver; falls back to the static foundation role map so
  // the client always receives a permission list to drive UI gating.
  async function permissionsForUser(role) {
    if (resolvePermissions) {
      try {
        const resolved = await resolvePermissions(role);
        if (Array.isArray(resolved) && resolved.length > 0) {
          return resolved;
        }
      } catch (error) {
        logger.warn?.({ role, error }, "Permission resolution failed; using static fallback");
      }
    }
    return staticPermissionsForRole(role);
  }

  return {
    async login({ username, password, ipAddress, userAgent }) {
      const normalizedUsername = String(username || "").trim();
      const user = normalizedUsername ? await authRepository.findByUsername(normalizedUsername) : null;
      const passwordHash = user?.passwordHash ?? DUMMY_HASH;
      const passwordMatches = await verifyPassword(String(password || ""), passwordHash);

      if (!user || !passwordMatches) {
        if (user) {
          await authRepository.recordFailedLogin(user.userId, { maxFailedLogins, lockoutMs });
        }
        logger.warn?.({ username: normalizedUsername, ipAddress }, "Login failed");
        throw invalidCredentialsError();
      }

      if (!user.isActive) {
        logger.warn?.({ userId: user.userId, ipAddress }, "Inactive account login blocked");
        throw authError("ACCOUNT_INACTIVE", "Account is inactive", 403);
      }

      if (isLocked(user)) {
        logger.warn?.({ userId: user.userId, ipAddress }, "Locked account login blocked");
        throw authError("ACCOUNT_LOCKED", "Account is temporarily locked", 423);
      }

      const sessionId = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);
      await authRepository.recordSuccessfulLogin(user.userId);
      await authRepository.createSession({ sessionId, userId: user.userId, expiresAt, ipAddress, userAgent });

      const token = createSessionToken({
        secret: tokenSecret,
        sessionId,
        userId: user.userId,
        role: user.role,
        warehouseIds: user.warehouseIds,
        expiresInSeconds: sessionTtlSeconds
      });

      logger.info?.({ userId: user.userId, ipAddress }, "Login succeeded");
      const permissions = await permissionsForUser(user.role);
      return { token, expiresAt, user: publicUser(user, permissions) };
    },

    async authenticateToken(token) {
      if (!token) {
        throw authError("UNAUTHORIZED", "Authentication required", 401);
      }

      let payload;
      try {
        payload = verifySessionToken({ secret: tokenSecret, token });
      } catch {
        throw authError("UNAUTHORIZED", "Authentication required", 401);
      }

      const session = await authRepository.findSession(payload.sid);
      if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
        throw authError("UNAUTHORIZED", "Authentication required", 401);
      }

      const user = await authRepository.findById(payload.sub);
      if (!user?.isActive) {
        throw authError("UNAUTHORIZED", "Authentication required", 401);
      }

      const permissions = await permissionsForUser(user.role);
      return publicUser(user, permissions);
    },

    async logout(token) {
      if (!token) return;
      try {
        const payload = verifySessionToken({ secret: tokenSecret, token });
        await authRepository.revokeSession(payload.sid);
      } catch {
        // Logout is idempotent and should not reveal token validity.
      }
    }
  };
}
