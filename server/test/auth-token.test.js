import { describe, expect, test } from "vitest";

import { createSessionToken, verifySessionToken } from "../src/auth/token.js";

describe("auth session tokens", () => {
  const secret = "test-secret-that-is-long-enough-for-hmac-signing";

  test("creates and verifies a signed session token", () => {
    const token = createSessionToken({
      secret,
      sessionId: "session-1",
      userId: "1",
      role: "admin",
      warehouseIds: [1, 2]
    });

    const payload = verifySessionToken({ secret, token });

    expect(payload).toMatchObject({
      sid: "session-1",
      sub: "1",
      role: "admin",
      warehouseIds: [1, 2]
    });
  });

  test("rejects tampered tokens", () => {
    const token = createSessionToken({
      secret,
      sessionId: "session-1",
      userId: "1",
      role: "admin",
      warehouseIds: [1]
    });

    expect(() => verifySessionToken({ secret: "different-secret", token })).toThrow();
  });
});
