import { createRequest, createResponse } from "node-mocks-http";
import { describe, expect, test, vi } from "vitest";

import { requireAuthContext } from "../src/http/authContext.js";

describe("auth context middleware", () => {
  test("rejects requests without an auth cookie or bearer token", async () => {
    const request = createRequest({ method: "GET", url: "/api/idm-08/ageing" });
    const response = createResponse();
    const next = vi.fn();

    await requireAuthContext(request, response, next);

    expect(response.statusCode).toBe(401);
    expect(response._getJSONData()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required"
      }
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("uses auth service to populate RBAC-compatible request auth", async () => {
    const request = createRequest({
      method: "GET",
      url: "/api/idm-08/ageing",
      headers: { cookie: "idm_auth=token-1" }
    });
    request.authService = {
      authenticateToken: vi.fn().mockResolvedValue({
        userId: "1",
        username: "admin",
        role: "admin",
        warehouseIds: [1, 2]
      })
    };
    const response = createResponse();
    const next = vi.fn();

    await requireAuthContext(request, response, next);

    expect(request.auth).toEqual({
      userId: "1",
      username: "admin",
      role: "admin",
      warehouseIds: [1, 2]
    });
    expect(next).toHaveBeenCalledOnce();
  });
});
