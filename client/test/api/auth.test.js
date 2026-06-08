import { describe, expect, test, vi, beforeEach } from "vitest";
import { login, logout, fetchCurrentUser } from "../../src/api/modules/auth.js";

vi.mock("../../src/api/client.js", () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return {
    get: mockGet,
    post: mockPost,
    __mockGet: mockGet,
    __mockPost: mockPost
  };
});

const mockClient = await import("../../src/api/client.js");

describe("auth API module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("login POSTs credentials to /auth/login", async () => {
    mockClient.__mockPost.mockResolvedValue({ user: { id: 1 } });
    const creds = { username: "admin", password: "admin123" };
    await login(creds);
    expect(mockClient.__mockPost).toHaveBeenCalledWith("/auth/login", creds);
  });

  test("logout POSTs an empty body to /auth/logout", async () => {
    mockClient.__mockPost.mockResolvedValue({});
    await logout();
    expect(mockClient.__mockPost).toHaveBeenCalledWith("/auth/logout", {});
  });

  test("fetchCurrentUser GETs /auth/me without retries", async () => {
    mockClient.__mockGet.mockResolvedValue({ id: 1 });
    await fetchCurrentUser();
    expect(mockClient.__mockGet).toHaveBeenCalledWith("/auth/me", { retries: 0 });
  });
});
