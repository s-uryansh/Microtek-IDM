# Microtek IDM

Microtek Inventory and Dispatch Management (IDM) is a serial-level warehouse operations system. SAP remains the ERP system of record; IDM is the physical-serial system of record for scanned stock receipt, dispatch, returns, battery pre-billing, exceptions, ageing, and traceability.

Last updated: 2026-06-07.

## Business Problem

Warehouse teams need reliable serial-level control over stock movement. The implemented portal supports receiving incoming stock, dispatch scanning, customer returns, battery pre-billing, fulfilment status, ageing reports, serial history, exception correction, and production import monitoring.

## Solution Architecture

- `server/`: Express API with route, service, repository, auth, RBAC, and PostgreSQL boundaries.
- `client/`: React/Vite web portal with protected routing, shared API client, dashboard, feature pages, mobile scan workflows, and tests.
- `db/migrations/`: PostgreSQL migrations `V001` through `V008` plus paired rollback scripts.
- `docs/` and `Plan/`: implementation, manual testing, progress, and readiness documentation.

## Tech Stack

- Frontend: React 19, Vite, React Router, Testing Library, Vitest
- Scanner fallback: `@zxing/browser`
- Backend: Node.js, Express, Zod, Pino, Helmet, CORS
- Auth: bcrypt password hashes, signed session token, server-side session table, HTTP-only persistent cookie
- Database: PostgreSQL with `pg`
- Testing and quality: Vitest, Supertest, node-mocks-http, ESLint

## IDM Module Overview

| Module | Status | Summary |
| --- | --- | --- |
| IDM-01 | Partially implemented | Production serial import API and Import Monitor page. Real SAP transport and factory-dispatch/invoice inbound adapters are absent. |
| IDM-02 | Integrated | GRN create/get/scan/complete workflow. |
| IDM-03 | Integrated | Battery pre-billing commit/status workflow with mobile web scanning. |
| IDM-04 | Integrated | SRN create/scan workflow. No SRN complete endpoint. |
| IDM-05 | Integrated | Dispatch create/scan/complete workflow. SAP outbound is absent. |
| IDM-06 | Backend complete | Serial validation API used by scan workflows. No standalone UI page. |
| IDM-07 | Integrated | Fulfilment status API and page. |
| IDM-08 | Integrated | Ageing report and opening-stock variance read APIs/pages. |
| IDM-09 | Integrated | Serial history timeline API and page. |
| IDM-10 | Integrated | Exception list/detail/correction API and page. |
| IDM-11 | Not started | No SFA/DMS implementation exists. |

## Authentication And Security

Login creates a server-side `auth_session` row and sets an `idm_auth` HTTP-only cookie. The cookie now has an expiry aligned with the backend session expiry, so sessions survive refresh and browser reopen until expiry or logout. Logout revokes the server-side session and clears the cookie. API requests use `credentials: "include"` and do not store tokens in frontend storage.

RBAC is enforced server-side with deny-by-default permissions and warehouse scope checks. CORS is restricted to the configured frontend origin.

## Mobile Scanning Support

The React web portal supports mobile scan workflows for GRN, Dispatch, SRN, and Battery.

- Native path: browser `BarcodeDetector` when available.
- Fallback path: `@zxing/browser` when `BarcodeDetector` is unavailable.
- Supported targets: QR, Code128, Code39, EAN13, UPC-A, UPC-E, and generic serial barcodes where browser/library decoding supports them.
- Hardware path: keyboard-wedge scanners through focused input plus Enter-key completion.

Camera scanning requires HTTPS or localhost and camera permission. Offline scan queue/sync is not implemented.

## Setup

Install dependencies:

```bash
npm install
```

Configure `.env` from `.env.example`, then run migrations and seed development data:

```bash
npm run migrate --workspace server
npm run seed:dev
```

Default development login:

```text
username: admin
password: admin123
```

## Running The System

Backend:

```bash
npm run dev:server
```

Frontend:

```bash
npm run dev:client
```

Open:

```text
http://localhost:5173
```

## Testing

Run all tests, linting, and build:

```bash
npm test
npm run lint
npm run build
```

Workspace commands:

```bash
npm run test --workspace server
npm run test --workspace client
npm run lint --workspace server
npm run lint --workspace client
npm run build --workspace client
```

## Manual Testing

Use [docs/manual-testing-guide.md](docs/manual-testing-guide.md) for API and portal smoke tests. Use [docs/IMPLEMENTATION_REFERENCE.md](docs/IMPLEMENTATION_REFERENCE.md) as the primary developer feature reference. CSV field formats are documented in [docs/CSV_FIELD_REFERENCE.md](docs/CSV_FIELD_REFERENCE.md).

## Operator Workflow Fallbacks

The web portal preserves multiple operator input paths:

- QR/barcode scan through browser camera or hardware scanner.
- Manual entry through visible fallback fields.
- CSV import for bulk fallback where operationally useful.
- CSV export for results, reports, timelines, and reviewed records.

Context required before scanning:

- Battery and Dispatch serial scans require invoice line context. Operators can select invoice/line or manually enter Invoice Line ID.
- GRN requires an active GRN created from SAP dispatch document and receiving warehouse.
- SRN requires receiving warehouse and condition tag.
- Fulfilment scans invoice IDs, not serials.
- Serial History scans serial numbers.
- Exceptions scans exception IDs for review; bulk correction is not implemented.

Scanner support:

- Supported barcode targets include QR, Code128, Code39, EAN13, UPC-A, UPC-E, and generic serial/invoice/exception codes where the active decoder supports them.
- Android HTTPS/ngrok testing resolved the secure-context blocker and QR camera scans can start.
- Camera diagnostics identify secure context, permission, camera availability, MediaDevices support, camera access blocking, and decoder initialization failures.
- Hardware scanner and manual entry remain available fallbacks.

## Known Limitations

- IDM-11 is not implemented.
- Real SAP inbound/outbound transports are not implemented.
- Offline scan queue/sync is not implemented.
- Native mobile app is not implemented.
- Dispatch and Battery require invoice line context before continuous scanning.
- Materialized-view refresh scheduling is not implemented.
- Production MFA/SSO/user-management UI is not implemented.
