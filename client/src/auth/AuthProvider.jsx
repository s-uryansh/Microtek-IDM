import { createContext, useEffect, useMemo, useState } from "react";

import { AUTH_EXPIRED_EVENT } from "../api/client.js";
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from "../api/modules/auth.js";

export const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
  setAuth: () => {},
  clearAuth: () => {}
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleAuthExpired() {
      setUser(null);
      setLoading(false);
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user?.userId && user?.role),
    async login(credentials) {
      const result = await loginRequest(credentials);
      setUser(result.user);
      return result.user;
    },
    async logout() {
      await logoutRequest().catch(() => {});
      setUser(null);
    },
    setAuth(nextAuth) {
      setUser(nextAuth);
    },
    clearAuth() {
      setUser(null);
    }
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { useAuth } from "./useAuth.js";
