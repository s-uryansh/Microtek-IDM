# Frontend Architecture Report

**Project:** Microtek IDM  
**Last audited:** 2026-06-07  
**Status:** Implemented web portal for current pilot API workflows, including Wave 4 mobile web scanning

## 1. Current Frontend Architecture

The frontend is a React/Vite application in `client/`. It uses React Router, a cookie-backed auth context, a shared API client, feature pages, and shared components.

Implemented entry points:

- `client/src/main.jsx`: imports CSS and renders `<App />`.
- `client/src/App.jsx`: wraps the router in `AuthProvider`.
- `client/src/Router.jsx`: defines `/login`, protected app shell routes, `errorElement` fallbacks, and page-level `ErrorBoundary` wrappers.

## 2. Authentication

Implemented auth flow:

- `AuthProvider` calls `GET /api/auth/me` on startup.
- Login page calls `POST /api/auth/login`.
- Logout calls `POST /api/auth/logout`.
- API requests use `credentials: "include"` to send the HTTP-only `idm_auth` cookie.
- The backend cookie expiry matches the server session expiry, so sessions restore after refresh and browser reopen until expiry.
- API 401 responses dispatch an auth-expired event; `AuthProvider` clears user state and protected routes redirect to login.
- Unauthenticated users are redirected to `/login`.

No localStorage auth defaults or auth-header injection exist in the current API client.

## 3. Implemented Routes

| Route | Page | Backend API usage |
| --- | --- | --- |
| `/dashboard` | Dashboard | Ageing and exception APIs |
| `/grn` | GRN page | IDM-02 create/scan/complete |
| `/dispatch` | Dispatch page | IDM-05 create/scan/complete |
| `/srn` | SRN page | IDM-04 create/scan |
| `/battery` | Battery page | IDM-03 commit/status |
| `/fulfilment` | Fulfilment page | IDM-07 status |
| `/ageing` | Ageing page | IDM-08 ageing |
| `/serials` | Serial History page | IDM-09 history |
| `/exceptions` | Exception Portal page | IDM-10 list/detail/correct |
| `/imports` | Import Monitor page | IDM-01 production import |

No IDM-11 route exists.

## 4. Shared Components

Implemented component groups:

- `components/ui`: Button, Card, Input, Badge, StatusBadge, Skeleton, EmptyState, ErrorState, Icon.
- `components/layout`: AppShell, Sidebar, TopBar, PageHeader.
- `components/charts`: KPICard, BarChart, TrendIndicator.
- `components/data`: DataTable, Pagination, ColumnSortHeader.
- `components/scan`: ScanCamera, ScanScanner, ScanInput, ScanResult, ScanHistory, ScanSession.
- `components/errors`: ErrorBoundary, RouteErrorFallback.

Shared scan hooks:

- `client/src/hooks/useScanner.js`: serial normalization, hardware scanner submission, camera stream lifecycle, native `BarcodeDetector`, `@zxing/browser` fallback, support detection, and camera pause/resume/stop state.
- `client/src/hooks/useScanSession.js`: shared scan submission state, duplicate detection, success/warning/error feedback, pause/resume, and scan history.

## 5. API Client

`client/src/api/client.js` provides:

- Base URL from `VITE_API_BASE_URL` or `http://localhost:4000/api`.
- JSON request/response handling.
- `credentials: "include"` for cookie-backed auth.
- Timeout and external abort handling.
- One retry for GET requests on retryable failures.
- No automatic POST retry.
- Normalized API errors through `ApiError`, `TimeoutError`, and `AbortError`.

API modules exist for ageing, auth, battery, dispatch, exceptions, fulfilment, GRN, history, imports, SRN, and validation.

## 6. Styling

CSS files are imported from `client/src/main.jsx`:

- `tokens.css`
- `global.css`
- `components.css`
- `layout.css`
- `charts.css`
- `datagrid.css`
- `scan.css`
- `dashboard.css`

The current visual system is a dark, warehouse-oriented interface with shared tokens and component classes.

Wave 4 responsive changes:

- App shell, top bar, sidebar, cards, pagination, and page headers have phone-oriented breakpoints.
- Scan sessions use larger touch targets, stable camera viewport dimensions, and compact small-screen history/result layouts.
- Data tables remain horizontal-scroll tables on small screens; they are bounded and padded for touch, but they are not yet transformed into card lists.

## 7. Current Limitations

- Many workflows require manual numeric IDs for warehouses, invoices, invoice lines, dispatch docs, and exceptions.
- Dashboard ageing calls use warehouse ID `3`.
- Top-bar search and notifications are visual only.
- Import Monitor submits production import payloads but does not list historical integration batches.
- IDM-06 has an API module but no standalone validation page.
- No native mobile app exists; scan components are web components only.
- Camera scanning requires secure context plus browser `MediaDevices`; native `BarcodeDetector` is preferred and `@zxing/browser` is the fallback decoder.
- Dispatch and Battery still require invoice line ID entry before continuous scanning.
- No offline queue/sync UI exists.
- No admin/configuration screens exist beyond the implemented feature pages.

## 8. Testing Status

Frontend tests cover:

- API client behavior and API module URL/body contracts.
- AuthProvider and ProtectedRoute.
- App shell/sidebar.
- Shared data, scan, chart, pagination, and error components.
- Scanner hooks and camera scanner component.
- Feature pages for dashboard, login, GRN, dispatch, SRN, battery, fulfilment, ageing, serial history, exceptions, and import monitor.

Run frontend tests with:

```bash
npm run test --workspace client
```
