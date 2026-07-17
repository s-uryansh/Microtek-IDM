<div align="center">

# Microtek IDM

### Inventory & Dispatch Management serial-level warehouse operations

<p>
  <img alt="Status" src="https://img.shields.io/badge/status-Under Development-yellow">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/express-4.21-000000?logo=express&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=black">
  <img alt="Vite" src="https://img.shields.io/badge/vite-6-646CFF?logo=vite&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/postgres-16-4169E1?logo=postgresql&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/redis-7-DC382D?logo=redis&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-vitest%20%2B%20supertest-6E9F18?logo=vitest&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-proprietary-lightgrey">
</p>

</div>

**Microtek Inventory & Dispatch Management (IDM)** is a serial-level warehouse operations system. SAP remains the ERP system of record; IDM is the system of record for the physical serial-scanned lifecycle: GRN receipt, customer dispatch, inter-warehouse transfer, SRN returns, battery pre-billing, exceptions, ageing, and traceability. Accepted scans update IDM stock/status immediately.

> [!NOTE]
> **Scope of record.** IDM owns every physical serial from `PRODUCED → IN_TRANSIT → IN_STOCK → DISPATCHED → RETURNED`, raising an `EXCEPTION` at any validation failure. SAP transports (inbound/outbound) are stubbed behind webhook/CSV import and export endpoints for a future adapter.
>
> **Serial identity.** Stored warehouse serials are composed as `<PRODUCT_NAME_PREFIX>_<RAW_SERIAL>` so two products can share the same raw stamped serial. Operators still scan the raw serial after selecting the product in product-first scan flows.

## Contents

- [Microtek IDM](#microtek-idm)
    - [Inventory \& Dispatch Management serial-level warehouse operations](#inventory--dispatch-management-serial-level-warehouse-operations)
  - [Contents](#contents)
  - [Tech Stack](#tech-stack)
  - [Repository Structure](#repository-structure)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Database Migrations](#database-migrations)
  - [Running](#running)
  - [IDM Modules](#idm-modules)
  - [Testing](#testing)
  - [Developer Notes](#developer-notes)
  - [Known Limitations](#known-limitations)

## Tech Stack

- **Backend:** Node.js + Express, Zod (validation), Pino (logging), Helmet/CORS, `pg` (PostgreSQL), `ioredis` (Redis), `express-rate-limit`.
- **Frontend:** React 19 + Vite, React Router, custom fetch API client; `@zxing/browser` + native `BarcodeDetector` for scanning.
- **Auth:** bcrypt hashes, signed session token in a server-side `auth_session` table, HTTP-only `idm_auth` cookie. RBAC is deny-by-default with warehouse-scope checks.
- **Database:** PostgreSQL (versioned SQL migrations).
- **Testing:** Vitest, Supertest, node-mocks-http, ESLint.

## Repository Structure

```
server/        Express API
  src/idm01..idm10/   feature modules (routes + service per module)
  src/db/             pg pool, repositories, migrate.js, seed-dev.js
  src/http/           auth context, RBAC enforcement, error responses
  src/security/       rbacPolicy (canonical permission → role map)
  src/models/         Zod schemas
  test/               Vitest suites
client/        React + Vite portal
  src/features/       one folder per page (dashboard, grn, dispatch, ...)
  src/api/            fetch client + per-module API modules
  src/auth/           AuthProvider, ProtectedRoute, PermissionRoute
  src/components/     layout + shared UI
db/migrations/  V###__name.sql forward + U###__name.sql rollback
docker-compose.yml   postgres + redis + migrate + server + client
```

The codebase follows a **route → service → repository** layering. Services hold business logic and are dependency-injected with `repositories`, so they are unit-tested with mocks; repositories own all SQL.

## Prerequisites

Minimum versions (newer is fine tested on the versions in parentheses):

- Node.js ≥ 20 (tested on 25.x), npm ≥ 10 (tested on 11.x)
- PostgreSQL ≥ 16 (tested on 18.x)
- Redis ≥ 7 (tested on 8.x)

Postgres and Redis are easiest via Docker (`docker-compose.yml` pins `postgres:16-alpine` and `redis:7-alpine`); a locally installed server of an equal-or-newer version works too.

## Setup

```bash
npm install                      # installs all workspaces (server + client)
cp .env.example .env             # then fill in the values below
```

Environment variables (`.env`) the backend validates these on startup (`server/src/models/configSchemas.js`). Everything except `DATABASE_URL` has a working default, so the app boots in dev with just the database set. The `R` / `P` columns flag what is **R**equired and what is additionally required **in P**roduction.

| Var | R | P | Default | Purpose |
| --- | :-: | :-: | --- | --- |
| `DATABASE_URL` | ✓ | | | Postgres connection string |
| `NODE_ENV` | | | `development` | `development` \| `test` \| `production` |
| `PORT` | | | `4000` | API port |
| `CORS_ORIGIN` | | | `http://localhost:5173` | Allowed frontend origin |
| `LOG_LEVEL` | | | `info` | `fatal`…`trace` \| `silent` |
| `AUTH_TOKEN_SECRET` | | ✓ | dev secret | Session-token signing key (≥32 chars; the dev default is rejected in prod) |
| `AUTH_SESSION_TTL_SECONDS` | | | `28800` | Session lifetime (8h) |
| `REDIS_URL` | | ✓ | `redis://localhost:6379` | Redis URL (must be `rediss://` TLS or loopback in prod) |
| `IMPORT_WEBHOOK_SECRET` | | ✓ | | HMAC secret for the SAP import webhook (≥32 chars). **If unset, the webhook signature check silently passes** |
| `AGEING_REFRESH_INTERVAL_MS` | | | `43200000` | Ageing snapshot refresh interval (12h) |
| `API_RATE_LIMIT_WINDOW_MS` | | | `60000` | General API rate-limit window |
| `API_RATE_LIMIT_MAX` | | | `600` | General API rate-limit max/window |
| `SCAN_RATE_LIMIT_WINDOW_MS` | | | `60000` | Scan/validate rate-limit window |
| `SCAN_RATE_LIMIT_MAX` | | | `240` | Scan/validate rate-limit max/window |
| `TRUST_PROXY` | | | `false` | Trusted proxy hops (or `true`/`false`); set behind a proxy/LB so `request.ip` is correct for rate limiting |
| `VITE_API_BASE_URL` | | | `http://localhost:4000/api` | Client → API base URL (read by the Vite client build, not the backend) |

Start Postgres + Redis (Docker):

```bash
docker compose up -d db redis
```

## Database Migrations

Migrations live in `db/migrations/` as `V###__name.sql` (forward) with paired `U###__name.sql` (rollback). They are applied in version order and tracked in the `schema_migrations` table, so re-running only applies new ones.

```bash
npm run migrate --workspace server     # apply all pending migrations
npm run seed:dev                        # load development data (optional)
npm run seed:dev:teardown               # remove seeded data
```

> After adding a `V###` file, always add the matching `U###` rollback. Migrations must be idempotent (`IF NOT EXISTS` / `IF EXISTS`).

## Running

Backend and frontend (two terminals):

```bash
npm run dev:server      # API on http://localhost:4000  (node --watch)
npm run dev:client      # portal on http://localhost:5173
```

Or the full stack (app + Postgres + Redis + auto-migrate) via Docker:

```bash
docker compose up --build
```

Default development logins (after `seed:dev`):

```
admin / admin123          (role: admin)
supervisor_1 / admin123   (role: supervisor)
operator_1 / admin123     (role: warehouse_operator)
```

## IDM Modules

| Module | What it does |
| --- | --- |
| **IDM-01** | Production import ingest SAP-produced serials via signed webhook **or** CSV upload; marks them IN_TRANSIT/PRODUCED and writes SAP dispatch docs. |
| **IDM-02** | GRN (goods receipt) load a SAP dispatch document, select the expected product, scan arriving serials, validate against the document, and update received counts/stock immediately. |
| **IDM-03** | Battery pre-billing commit battery serials to an invoice line before dispatch (a battery can't dispatch unless pre-billed). |
| **IDM-04** | Returns (SRN) + condition correction receive returns against a dispatched invoice, declare original-only vs mixed/non-original stock, mark accepted foreign stock as NOT ORIGINAL, re-open returnable invoice quantity, and retag DEFECTIVE/REPAIR stock back to SALEABLE. |
| **IDM-05** | Dispatch dispatch stock against an invoice with live warehouse-stock availability, product-first scanning, partial dispatch handling, condition-hold and battery-pre-bill gates, inter-warehouse transfer, and SAP export. Split into three route/service groups: customer dispatch, warehouse transfer, and export. |
| **IDM-06** | Serial validation the shared, context-aware "is this serial valid for this operation?" primitive every scan module calls first. |
| **IDM-07** | Fulfilment status reports how far an invoice is fulfilled (pending / partial / dispatched) and gates dispatch completion. |
| **IDM-08** | Reporting ageing buckets (how long stock has sat) + opening-stock reconciliation (SAP vs IDM quantity variance); CSV/SAP exports. |
| **IDM-09** | Serial history a single time-ordered audit timeline of every event and exception for a serial, across warehouses. |
| **IDM-10** | Exception correction list/triage/resolve exceptions raised by scan workflows, each closed with a mandatory reason and status. |
| **Admin** | Manage warehouses, roles + permissions, and members; product CSV import/export; invoice viewer (list/detail, bulk import, POD documents); inbound SAP dispatch-doc stock and current warehouse stock viewers. All under `/api/admin` (`admin:access`; `GET /invoices` requires `invoice:read`). |

## Testing

```bash
npm test          # all workspaces
npm run lint
npm run build

npm run test --workspace server
npm run test --workspace client
```

## Developer Notes

- **Layering:** put SQL only in `src/db/*Repository.js`; keep business logic in `src/idm*/...Service.js`; routes stay thin (parse, auth, delegate).
- **RBAC:** permissions are defined in `src/security/rbacPolicy.js` (role → permission set) and **seeded via a migration** into `role_permission`. To add a permission: update `rbacPolicy.js`, add a seed migration, and gate the route with `requirePermission("...")`.
- **Auth context:** routes use `requireAuthContext` + `requirePermission(code, { warehouseIdFromBody|warehouseIdFromQuery })`; admins bypass scope, others are checked against assigned `warehouseIds`.
- **Serial lifecycle:** modules append `serial_event` rows and raise `exception_log` entries as they work these power IDM-09 (history) and IDM-10 (exception desk).
- **Returns & re-dispatch:** dispatch scans are *soft-returned* (`returned_at`) rather than deleted; scan/quantity counts exclude returned rows so a returned serial can be re-dispatched.
- **SRN foreign stock:** an SRN must declare whether it is original-only or may include different products. Original-only returns reject serials not linked to that invoice; mixed returns accept them into stock flagged `NOT ORIGINAL`.
- **Product-first scans:** GRN, dispatch, transfer, battery, and SRN require product selection before scanning when product lines are available; the selected product disambiguates raw serials that exist under more than one product.
- **Composed serials:** `serial_master.serial_no` stores product-name prefix + raw serial; `base_serial` keeps the raw scanned value.
- **Idempotency:** batch imports are de-duplicated by `externalRef`; receipt/dispatch uniqueness is enforced by partial unique indexes (`WHERE returned_at IS NULL`) plus serial state transitions.
- **Scanning:** native `BarcodeDetector` with `@zxing/browser` fallback and a keyboard-wedge (hardware scanner) path; camera scanning requires HTTPS or localhost.

## Known Limitations

- Real SAP inbound/outbound transports are not implemented (webhook/CSV in, export out only).
- IDM-11 (SFA/DMS) is not implemented.
- Offline scan queue/sync and a native mobile app are not implemented.
