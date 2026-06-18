import { createBrowserRouter, Navigate } from "react-router-dom";

import { ProtectedRoute } from "./auth/ProtectedRoute.jsx";
import { PermissionRoute } from "./auth/PermissionRoute.jsx";
import { AppShell } from "./components/layout/AppShell.jsx";
import { RouteErrorFallback } from "./components/errors/RouteErrorFallback.jsx";
import { ErrorBoundary } from "./components/errors/ErrorBoundary.jsx";
import { DashboardPage } from "./features/dashboard/DashboardPage.jsx";
import { GRNPage } from "./features/grn/GRNPage.jsx";
import { DispatchPage } from "./features/dispatch/DispatchPage.jsx";
import { SRNPage } from "./features/srn/SRNPage.jsx";
import { ConditionPage } from "./features/condition/ConditionPage.jsx";
import { BatteryPage } from "./features/battery/BatteryPage.jsx";
import { FulfilmentPage } from "./features/fulfilment/FulfilmentPage.jsx";
import { AgeingPage } from "./features/ageing/AgeingPage.jsx";
import { SerialHistoryPage } from "./features/serials/SerialHistoryPage.jsx";
import { ExceptionsPage } from "./features/exceptions/ExceptionsPage.jsx";
import { ImportProductionPage } from "./features/imports/ImportProductionPage.jsx";
import {
  InboundPage,
  InvoicesPage,
  MembersPage,
  ProductsPage,
  RolesPage,
  StockPage,
  WarehousesPage
} from "./features/admin/AdminPage.jsx";
import { LoginPage } from "./features/auth/LoginPage.jsx";

function withBoundary(node) {
  return (
    <ErrorBoundary resetKey={typeof window !== "undefined" ? window.location.pathname : ""}>
      {node}
    </ErrorBoundary>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <RouteErrorFallback />
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: withBoundary(<DashboardPage />), errorElement: <RouteErrorFallback /> },
      { path: "grn", element: withBoundary(<GRNPage />), errorElement: <RouteErrorFallback /> },
      { path: "dispatch", element: withBoundary(<DispatchPage />), errorElement: <RouteErrorFallback /> },
      { path: "srn", element: withBoundary(<SRNPage />), errorElement: <RouteErrorFallback /> },
      {
        path: "condition",
        element: (
          <PermissionRoute permission="condition:correct">
            {withBoundary(<ConditionPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      { path: "battery", element: withBoundary(<BatteryPage />), errorElement: <RouteErrorFallback /> },
      { path: "fulfilment", element: withBoundary(<FulfilmentPage />), errorElement: <RouteErrorFallback /> },
      { path: "ageing", element: withBoundary(<AgeingPage />), errorElement: <RouteErrorFallback /> },
      { path: "serials", element: withBoundary(<SerialHistoryPage />), errorElement: <RouteErrorFallback /> },
      { path: "exceptions", element: withBoundary(<ExceptionsPage />), errorElement: <RouteErrorFallback /> },
      {
        path: "imports",
        element: (
          <PermissionRoute permission="integration:import">
            {withBoundary(<ImportProductionPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      { path: "admin", element: <Navigate to="/admin/warehouses" replace /> },
      {
        path: "admin/warehouses",
        element: (
          <PermissionRoute permission="admin:access">
            {withBoundary(<WarehousesPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      {
        path: "admin/members",
        element: (
          <PermissionRoute permission="admin:access">
            {withBoundary(<MembersPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      {
        path: "admin/roles",
        element: (
          <PermissionRoute permission="admin:access">
            {withBoundary(<RolesPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      {
        path: "admin/products",
        element: (
          <PermissionRoute permission="admin:access">
            {withBoundary(<ProductsPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      {
        path: "admin/invoices",
        element: (
          <PermissionRoute permission="invoice:read">
            {withBoundary(<InvoicesPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      {
        path: "admin/inbound",
        element: (
          <PermissionRoute permission="admin:access">
            {withBoundary(<InboundPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      },
      {
        path: "admin/stock",
        element: (
          <PermissionRoute permission="admin:access">
            {withBoundary(<StockPage />)}
          </PermissionRoute>
        ),
        errorElement: <RouteErrorFallback />
      }
    ]
  }
]);
