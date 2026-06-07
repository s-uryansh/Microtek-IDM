import { ApiError, TimeoutError, AbortError } from "./errors.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const DEFAULT_TIMEOUT = 15000;
const GET_RETRY_COUNT = 1;
const GET_RETRY_DELAY = 500;
export const AUTH_EXPIRED_EVENT = "microtek-idm:auth-expired";

function getHeaders() {
  return { "Content-Type": "application/json" };
}

function normalizeResponse(body, status) {
  if (body?.error) {
    throw new ApiError(status, body);
  }
  return body ?? {};
}

function notifyAuthExpired(status) {
  if (status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }
}

async function request(method, path, options = {}) {
  const { body, timeout = DEFAULT_TIMEOUT, signal: externalSignal } = options;
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const combinedSignal = externalSignal
    ? combineSignals(externalSignal, controller.signal)
    : controller.signal;

  try {
    const fetchOptions = {
      method,
      headers: getHeaders(),
      credentials: "include",
      signal: combinedSignal,
    };
    if (body && method !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      notifyAuthExpired(response.status);
      throw new ApiError(response.status, responseBody);
    }

    return normalizeResponse(responseBody, response.status);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof ApiError) throw error;
    if (error.name === "AbortError") {
      if (externalSignal?.aborted) throw new AbortError();
      throw new TimeoutError();
    }
    throw error;
  }
}

function combineSignals(s1, s2) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  s1.addEventListener("abort", onAbort);
  s2.addEventListener("abort", onAbort);
  if (s1.aborted || s2.aborted) controller.abort();
  return controller.signal;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function get(path, options = {}) {
  const { retries = GET_RETRY_COUNT } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await request("GET", path, options);
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError && error.status < 500) throw error;
      if (attempt < retries) await sleep(GET_RETRY_DELAY * (attempt + 1));
    }
  }
  throw lastError;
}

export function post(path, body, options = {}) {
  return request("POST", path, { ...options, body });
}

export function put(path, body, options = {}) {
  return request("PUT", path, { ...options, body });
}

export function del(path, options = {}) {
  return request("DELETE", path, options);
}
