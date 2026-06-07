# Microtek IDM Client

The client is a React/Vite web portal for Microtek IDM warehouse operations.

## Architecture

- Entry point: `src/main.jsx`
- App wrapper: `src/App.jsx`
- Router: `src/Router.jsx`
- Auth: `src/auth/`
- API client: `src/api/client.js`
- API modules: `src/api/modules/`
- Shared components: `src/components/`
- Feature pages: `src/features/`
- Styles: `src/styles/`
- Shared scanner hooks: `src/hooks/useScanner.js`, `src/hooks/useScanSession.js`

## Routing

Protected routes live under the app shell:

- `/dashboard`
- `/grn`
- `/dispatch`
- `/srn`
- `/battery`
- `/fulfilment`
- `/ageing`
- `/serials`
- `/exceptions`
- `/imports`

`/login` is public. Unauthenticated users are redirected to login.

## Auth Flow

`AuthProvider` calls `GET /api/auth/me` on boot using the HTTP-only `idm_auth` cookie. Login calls `POST /api/auth/login`; logout calls `POST /api/auth/logout`. The API client dispatches an auth-expired event on 401 so the provider clears local user state and protected routes redirect to login.

No token is stored in localStorage or sessionStorage.

## API Layer

`src/api/client.js` wraps `fetch` with:

- `credentials: "include"`
- JSON request/response handling
- timeout and abort handling
- one GET retry for retryable failures
- normalized `ApiError`, `TimeoutError`, and `AbortError`
- auth-expired event dispatch on 401

## Scanner Architecture

Scanner code is shared across GRN, Dispatch, SRN, and Battery:

- `useScanner`: camera lifecycle, native `BarcodeDetector`, ZXing fallback, hardware scanner submission, cleanup.
- `useScanSession`: duplicate detection, pause/resume, scan state, success/warning/error feedback, history.
- `ScanCamera`: camera preview, permission/error/unsupported/retry states.
- `ScanScanner`: keyboard-wedge/manual scanner input.
- `ScanSession`: workflow-level orchestration.

Camera scanning priority:

1. Native `BarcodeDetector`
2. `@zxing/browser`
3. Hardware/manual scanner input

## Design System And Mobile Support

CSS tokens live in `src/styles/tokens.css`. Component, layout, data grid, chart, dashboard, and scanner styles are imported from `src/main.jsx`.

The portal is mobile-responsive for warehouse use, with larger touch targets, responsive app shell/sidebar, mobile scan panels, and bounded data table overflow. It is still a web portal, not a native mobile app.

## Testing

Run client tests:

```bash
npm run test --workspace client
```

Run lint/build:

```bash
npm run lint --workspace client
npm run build --workspace client
```
