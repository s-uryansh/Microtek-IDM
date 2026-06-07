import { get, post } from "../client.js";

export function login(credentials) {
  return post("/auth/login", credentials);
}

export function logout() {
  return post("/auth/logout", {});
}

export function fetchCurrentUser() {
  return get("/auth/me", { retries: 0 });
}
