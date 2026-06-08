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

Scanner code is shared across GRN, Dispatch, SRN, Battery, Fulfilment invoice lookup, Serial History lookup, and Exception review lookup:

- `useScanner`: camera lifecycle, native `BarcodeDetector`, ZXing fallback, hardware scanner submission, cleanup, and actionable diagnostics.
- `useScanSession`: duplicate detection, duplicate cooldown, pause/resume, scan state, success/warning/error feedback, history.
- `ScanCamera`: camera preview, permission/error/unsupported/retry states.
- `ScanScanner`: keyboard-wedge/manual scanner input.
- `ScanSession`: workflow-level orchestration.

Camera scanning priority:

1. Native `BarcodeDetector`
2. `@zxing/browser`
3. Hardware/manual scanner input

Camera diagnostics identify:

- Secure context required.
- Camera permission denied.
- No camera device detected.
- Browser lacks MediaDevices support.
- Decoder initialization failure.
- Camera access blocked.
- Unsupported browser capability.

Android testing update: HTTPS/ngrok resolved the secure-context blocker and QR camera scans can start. Battery/Dispatch QR serial scanning still requires invoice line context before submitting serials.

## Workflow Fallbacks

Manual fields must remain visible as permanent fallbacks. The completed operator screens support these input paths:

- IDM-02 GRN: scan/manual/CSV import serials and CSV export GRN results after GRN session creation.
- IDM-03 Battery: select or manually enter Invoice Line ID, then scan/manual/CSV import battery serials and CSV export commit results.
- IDM-04 SRN: scan/manual/CSV import returned serials and CSV export processed returns.
- IDM-05 Dispatch: select or manually enter Invoice Line ID, then scan/manual/CSV import dispatch serials and CSV export dispatch results.
- IDM-07 Fulfilment: scan/manual/CSV import invoice IDs and CSV export fulfilment status.
- IDM-09 Serial History: scan/manual/CSV import serials and CSV export timelines.
- IDM-10 Exceptions: scan/manual/CSV import exception IDs for review and CSV export lists/details. Bulk correction is intentionally not implemented.

CSV formats are documented in `../docs/CSV_FIELD_REFERENCE.md`.

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
