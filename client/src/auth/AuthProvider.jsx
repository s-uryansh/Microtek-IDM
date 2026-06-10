import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AUTH_EXPIRED_EVENT } from "../api/client.js";
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from "../api/modules/auth.js";

export const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  permissions: [],
  hasPermission: () => false,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
  setAuth: () => {},
  clearAuth: () => {}
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = useRef(false);

  // Re-fetch the current user (identity + permissions) from the server. Used to
  // keep client-side permission gating in sync after a role's permissions change
  // server-side, without forcing the user to log out and back in.
  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const result = await fetchCurrentUser();
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      refreshingRef.current = false;
    }
  }, []);

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

  // Revalidate permissions when the tab regains focus / becomes visible, so an
  // admin's role/permission change reaches an already-open session promptly.
  useEffect(() => {
    if (!user?.userId) return undefined;
    function revalidate() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refresh();
    }
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [user?.userId, refresh]);

  const value = useMemo(() => {
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    const permissionSet = new Set(permissions);
    return {
    user,
    loading,
    isAuthenticated: Boolean(user?.userId && user?.role),
    permissions,
    hasPermission: (permission) => permissionSet.has(permission),
    async login(credentials) {
      const result = await loginRequest(credentials);
      setUser(result.user);
      return result.user;
    },
    async logout() {
      await logoutRequest().catch(() => {});
      setUser(null);
    },
    refresh,
    setAuth(nextAuth) {
      setUser(nextAuth);
    },
    clearAuth() {
      setUser(null);
    }
    };
  }, [loading, user, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { useAuth } from "./useAuth.js";
