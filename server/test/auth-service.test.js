import { describe, expect, test, vi } from "vitest";

import { createAuthService } from "../src/auth/authService.js";
import { hashPassword } from "../src/auth/password.js";
import { staticPermissionsForRole } from "../src/security/rbacPolicy.js";

function createRepository({ user }) {
  return {
    findByUsername: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    recordFailedLogin: vi.fn().mockResolvedValue(),
    recordSuccessfulLogin: vi.fn().mockResolvedValue(),
    createSession: vi.fn().mockResolvedValue({ sessionId: "session-1" }),
    findSession: vi.fn().mockResolvedValue({ sessionId: "session-1", revokedAt: null, expiresAt: new Date(Date.now() + 60000) }),
    revokeSession: vi.fn().mockResolvedValue()
  };
}

describe("auth service", () => {
  test("logs in an active user and creates a server-side session", async () => {
    const passwordHash = await hashPassword("admin123");
    const user = {
      userId: "1",
      username: "admin",
      passwordHash,
      role: "admin",
      isActive: true,
      warehouseIds: [1, 2]
    };
    const repository = createRepository({ user });
    const service = createAuthService({
      authRepository: repository,
      tokenSecret: "test-secret-that-is-long-enough",
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    const result = await service.login({ username: "admin", password: "admin123", ipAddress: "127.0.0.1" });

    expect(result.user).toEqual({
      userId: "1",
      username: "admin",
      role: "admin",
      warehouseIds: [1, 2],
      permissions: staticPermissionsForRole("admin")
    });
    expect(result.token).toEqual(expect.any(String));
    expect(repository.recordSuccessfulLogin).toHaveBeenCalledWith("1");
    expect(repository.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "1" }));
  });

  test("rejects invalid passwords and records a failed login", async () => {
    const user = {
      userId: "1",
      username: "admin",
      passwordHash: await hashPassword("admin123"),
      role: "admin",
      isActive: true,
      warehouseIds: [1]
    };
    const repository = createRepository({ user });
    const service = createAuthService({
      authRepository: repository,
      tokenSecret: "test-secret-that-is-long-enough",
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(service.login({ username: "admin", password: "wrong", ipAddress: "127.0.0.1" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401
    });
    expect(repository.recordFailedLogin).toHaveBeenCalledWith("1", expect.any(Object));
  });

  test("rejects unknown users with the same generic credential error", async () => {
    const repository = createRepository({ user: null });
    const service = createAuthService({
      authRepository: repository,
      tokenSecret: "test-secret-that-is-long-enough",
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(service.login({ username: "missing", password: "admin123", ipAddress: "127.0.0.1" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401
    });
    expect(repository.recordFailedLogin).not.toHaveBeenCalled();
  });

  test("rejects inactive users", async () => {
    const repository = createRepository({
      user: {
        userId: "1",
        username: "admin",
        passwordHash: await hashPassword("admin123"),
        role: "admin",
        isActive: false,
        warehouseIds: [1]
      }
    });
    const service = createAuthService({
      authRepository: repository,
      tokenSecret: "test-secret-that-is-long-enough",
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(service.login({ username: "admin", password: "admin123", ipAddress: "127.0.0.1" })).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE",
      status: 403
    });
  });

  test("rejects locked users after password verification", async () => {
    const repository = createRepository({
      user: {
        userId: "1",
        username: "admin",
        passwordHash: await hashPassword("admin123"),
        role: "admin",
        isActive: true,
        lockedUntil: new Date(Date.now() + 60000),
        warehouseIds: [1]
      }
    });
    const service = createAuthService({
      authRepository: repository,
      tokenSecret: "test-secret-that-is-long-enough",
      logger: { info: vi.fn(), warn: vi.fn() }
    });

    await expect(service.login({ username: "admin", password: "admin123", ipAddress: "127.0.0.1" })).rejects.toMatchObject({
      code: "ACCOUNT_LOCKED",
      status: 423
    });
  });

  test("authenticates a request token and returns RBAC-compatible auth context", async () => {
    const user = {
      userId: "1",
      username: "admin",
      passwordHash: await hashPassword("admin123"),
      role: "admin",
      isActive: true,
      warehouseIds: [1, 2]
    };
    const repository = createRepository({ user });
    const service = createAuthService({
      authRepository: repository,
      tokenSecret: "test-secret-that-is-long-enough",
      logger: { info: vi.fn(), warn: vi.fn() }
    });
    const login = await service.login({ username: "admin", password: "admin123", ipAddress: "127.0.0.1" });

    const auth = await service.authenticateToken(login.token);

    expect(auth).toEqual({
      userId: "1",
      username: "admin",
      role: "admin",
      warehouseIds: [1, 2],
      permissions: staticPermissionsForRole("admin")
    });
  });
});
