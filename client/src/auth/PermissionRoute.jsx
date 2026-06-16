import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./useAuth.js";

export function PermissionRoute({ permission, children }) {
  const { isAuthenticated, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="auth-loading" role="status">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasPermission?.(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
