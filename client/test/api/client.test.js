import { describe, expect, test, vi, beforeEach } from "vitest";
import { get, post } from "../../src/api/client.js";
import { ApiError, TimeoutError, AbortError } from "../../src/api/errors.js";

function mockFetch(response) {
  global.fetch = vi.fn().mockResolvedValue(response);
}

function mockFetchReject(error) {
  global.fetch = vi.fn().mockRejectedValue(error);
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn();
  localStorage.clear();
});

describe("API client — normalization & error mapping", () => {
  test("returns object body on 2xx with no error field", async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.resolve({ id: 7, name: "x" }) });
    await expect(get("/x")).resolves.toEqual({ id: 7, name: "x" });
  });

  test("returns empty object when body is empty (200, null body)", async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.resolve(null) });
    await expect(get("/x")).resolves.toEqual({});
  });

  test("returns empty object when body is empty (204 no body)", async () => {
    mockFetch({ ok: true, status: 204, json: () => Promise.reject(new SyntaxError("no body")) });
    await expect(get("/x")).resolves.toEqual({});
  });

  test("throws ApiError with nested message for { error: { message } }", async () => {
    mockFetch({ ok: false, status: 400, json: () => Promise.resolve({ error: { message: "Bad input" } }) });
    await expect(get("/bad")).rejects.toBeInstanceOf(ApiError);
    await expect(get("/bad")).rejects.toThrow("Bad input");
  });

  test("throws ApiError for plain string error field", async () => {
    mockFetch({ ok: false, status: 422, json: () => Promise.resolve({ error: "string error" }) });
    await expect(get("/bad")).rejects.toThrow("string error");
  });

  test("throws ApiError for non-JSON failure body", async () => {
    mockFetch({ ok: false, status: 500, json: () => Promise.reject(new SyntaxError("parse fail")) });
    await expect(get("/boom")).rejects.toBeInstanceOf(ApiError);
  });

  test("throws TimeoutError when fetch aborts via internal timeout", async () => {
    mockFetchReject({ name: "AbortError" });
    await expect(get("/slow", { timeout: 1 })).rejects.toBeInstanceOf(TimeoutError);
  });

  test("throws AbortError when external signal aborts", async () => {
    mockFetchReject({ name: "AbortError" });
    const controller = new AbortController();
    controller.abort();
    await expect(get("/x", { signal: controller.signal })).rejects.toBeInstanceOf(AbortError);
  });

  test("re-throws non-AbortError network errors", async () => {
    const err = new TypeError("Network down");
    mockFetchReject(err);
    await expect(get("/x")).rejects.toBe(err);
  });
});

describe("API client — retry behavior", () => {
  test("retries GET on 5xx and eventually returns the body", async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: "down" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ recovered: true }) });
    });
    const result = await get("/flaky");
    expect(result).toEqual({ recovered: true });
    expect(calls).toBe(2);
  });

  test("does NOT retry on 4xx", async () => {
    let calls = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: "bad" }) });
    });
    await expect(get("/bad")).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  });

  test("retries once then throws the last ApiError when all attempts fail 5xx", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "still down" })
    });
    await expect(get("/dead")).rejects.toThrow("still down");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("POST does not auto-retry even on 5xx", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "fail" })
    });
    await expect(post("/submit", { a: 1 })).rejects.toBeInstanceOf(ApiError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("API client — auth headers", () => {
  test("does not send caller-controlled auth headers", async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await get("/x");
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers).not.toHaveProperty("x-user-id");
    expect(options.headers).not.toHaveProperty("x-user-role");
    expect(options.headers).not.toHaveProperty("x-warehouse-ids");
  });

  test("uses credentialed requests for auth cookies", async () => {
    localStorage.setItem("auth_userId", "admin_1");
    localStorage.setItem("auth_role", "admin");
    localStorage.setItem("auth_warehouseIds", "1,2");
    mockFetch({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await get("/x");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: "include"
      })
    );
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers).not.toHaveProperty("x-user-id");
    expect(options.headers).not.toHaveProperty("x-user-role");
    expect(options.headers).not.toHaveProperty("x-warehouse-ids");
  });

  test("dispatches an auth expired event when a credentialed request returns 401", async () => {
    const listener = vi.fn();
    window.addEventListener("microtek-idm:auth-expired", listener);
    mockFetch({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: "UNAUTHORIZED", message: "Authentication required" } })
    });

    await expect(get("/protected")).rejects.toBeInstanceOf(ApiError);

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("microtek-idm:auth-expired", listener);
  });
});

describe("API client — request shape", () => {
  test("GET uses GET method and no body", async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.resolve({}) });
    await get("/x");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "GET" })
    );
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.body).toBeUndefined();
  });

  test("POST serializes body to JSON and uses POST method", async () => {
    mockFetch({ ok: true, status: 201, json: () => Promise.resolve({ id: 1 }) });
    await post("/x", { hello: "world" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ hello: "world" })
      })
    );
  });
});
