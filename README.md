# Microtek IDM

Microtek IDM is a serial-level inventory and dispatch management system for Microtek. SAP remains the ERP system of record; IDM is being built as the physical-serial system of record that tracks actual scanned serials, records exceptions, and reconciles physical inventory back to SAP.

The project is currently in the Sprint 4 business-module phase. Sprint 0 foundation, Sprint 1 import/validation foundations, Sprint 2 dispatch/fulfilment foundations, Sprint 3 ageing/reporting foundations, platform hardening, and backend starts for IDM-02/04/09 are in place. SAP outbound transport, mobile scanning flows, and later portal modules are not implemented yet.

## Architecture Overview

The codebase is organized as an npm workspace with a React frontend and an Express backend.

- `client/`: React/Vite application shell.
- `server/`: Express API, services, repositories, auth/RBAC scaffold, tests.
- `db/migrations/`: PostgreSQL SQL migrations and paired rollback scripts.
- `Plan/`: source project documents, SOW, implementation plan, SQL plan, security audit, test suite, progress tracker.
- `docs/`: implementation assumptions captured during Sprint 0 and Sprint 1.

Key backend boundaries:

- Routes live under feature folders such as `server/src/idm01` and `server/src/idm06`.
- Services hold business behavior and are tested without a live database.
- Repositories are the only layer that talks to PostgreSQL and use parameterized `pg` queries.
- RBAC is deny-by-default and currently contains temporary Sprint 0/1 permissions until OI-9 is finalized.

## Tech Stack

- Frontend: React, Vite
- Backend: Node.js, Express
- Database: PostgreSQL
- Database driver: `pg`
- Validation: `zod`
- Logging: `pino`
- Security middleware: `helmet`, `cors`
- Testing: Vitest, Testing Library, node-mocks-http
- Linting: ESLint

## Repository Structure

```text
.
├── AGENTS.md
├── Documentation/
├── Plan/
├── client/
│   ├── src/
│   ├── test/
│   ├── package.json
│   └── vite.config.js
├── db/
│   └── migrations/
├── docs/
├── server/
│   ├── src/
│   │   ├── db/
│   │   ├── http/
│   │   ├── idm01/
│   │   ├── idm06/
│   │   └── security/
│   ├── test/
│   └── package.json
├── .env.example
├── package.json
└── package-lock.json
```

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 14 or newer recommended
- A local PostgreSQL user/database for development

## Environment Variables

Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Required variables:

```text
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://microtek_idm:microtek_idm@localhost:5432/microtek_idm
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
VITE_API_BASE_URL=http://localhost:4000/api
```

Notes:

- Do not commit real `.env` files or secrets.
- `DATABASE_URL` must point to a PostgreSQL database where migrations can run.
- `VITE_API_BASE_URL` is currently reserved for frontend API wiring; the Sprint 0 client shell does not call the backend yet.

## PostgreSQL Setup

Example local database setup:

```bash
sudo -u postgres psql
```

```sql
CREATE USER microtek_idm WITH PASSWORD 'microtek_idm';
CREATE DATABASE microtek_idm OWNER microtek_idm;
GRANT ALL PRIVILEGES ON DATABASE microtek_idm TO microtek_idm;
```

Then confirm the URL in `.env`:

```text
DATABASE_URL=postgres://microtek_idm:microtek_idm@localhost:5432/microtek_idm
```

## Database Migrations

Migration files live in `db/migrations`.

Current migrations:

- `V001__foundation_reference_rbac.sql`: warehouses, products, roles, users, user warehouse scope.
- `U001__foundation_reference_rbac.sql`: rollback for V001.
- `V002__serial_core_integration.sql`: `integration_batch`, `serial_master`, `serial_event`, `exception_log`.
- `U002__serial_core_integration.sql`: rollback for V002.
- `V003__invoice_dispatch.sql`: `invoice`, `invoice_line`, `dispatch`, `dispatch_scan`.
- `U003__invoice_dispatch.sql`: rollback for V003.
- `V004__ageing_reconciliation.sql`: ageing snapshot and opening-stock reconciliation foundations.
- `U004__ageing_reconciliation.sql`: rollback for V004.
- `V005__platform_hardening.sql`: transaction/concurrency hardening indexes.
- `U005__platform_hardening.sql`: rollback for V005.
- `V006__grn_srn_history.sql`: sender dispatch documents, GRN, SRN, and history lookup support.
- `U006__grn_srn_history.sql`: rollback for V006.

Run migrations:

```bash
npm run migrate --workspace server
```

Rollback scripts are manual SQL scripts for pre-go-live use only:

```bash
psql "$DATABASE_URL" -f db/migrations/U006__grn_srn_history.sql
psql "$DATABASE_URL" -f db/migrations/U005__platform_hardening.sql
psql "$DATABASE_URL" -f db/migrations/U004__ageing_reconciliation.sql
psql "$DATABASE_URL" -f db/migrations/U003__invoice_dispatch.sql
psql "$DATABASE_URL" -f db/migrations/U002__serial_core_integration.sql
psql "$DATABASE_URL" -f db/migrations/U001__foundation_reference_rbac.sql
```

Production posture from the project handbook: after warehouse go-live, schema rollback is forbidden; fix forward with new migrations.

## Seed Data

Development seed scripts are available for non-production local testing.

Load seed data:

```bash
npm run seed:dev
```

Remove seed data:

```bash
npm run seed:dev:teardown
```

The seed runner is environment-guarded and refuses to run when `NODE_ENV=production` or when `DATABASE_URL` looks production-like. Manual API testing steps are documented in `docs/manual-testing-guide.md`.

## Backend Setup

Install dependencies from the repository root:

```bash
npm install
```

Run the backend in development:

```bash
NODE_ENV=development \
PORT=4000 \
DATABASE_URL=postgres://microtek_idm:microtek_idm@localhost:5432/microtek_idm \
CORS_ORIGIN=http://localhost:5173 \
LOG_LEVEL=info \
npm run dev:server
```

Run the backend directly from the server workspace:

```bash
npm run dev --workspace server
```

The backend health endpoint is:

```text
GET /health
```

## Frontend Setup

Install dependencies from the repository root:

```bash
npm install
```

Run the frontend:

```bash
npm run dev:client
```

By default Vite serves the client at:

```text
http://localhost:5173
```

The current frontend is a Sprint 0 shell. Feature UI screens for import, validation, GRN, dispatch, reports, and exception correction are not implemented yet.

## Run the Entire Project Locally

In one terminal, run the backend:

```bash
NODE_ENV=development \
PORT=4000 \
DATABASE_URL=postgres://microtek_idm:microtek_idm@localhost:5432/microtek_idm \
CORS_ORIGIN=http://localhost:5173 \
LOG_LEVEL=info \
npm run dev:server
```

In another terminal, run the frontend:

```bash
npm run dev:client
```

Then open:

```text
http://localhost:5173
```

## Run Backend and Frontend Separately

Backend only:

```bash
npm run dev:server
```

Frontend only:

```bash
npm run dev:client
```

## Tests

Run all tests:

```bash
npm test
```

Run backend tests only:

```bash
npm run test --workspace server
```

Run frontend tests only:

```bash
npm run test --workspace client
```

Current test coverage includes:

- Express foundation health/error behavior.
- Environment config validation.
- RBAC scaffold behavior.
- V001 and V002 migration contract checks.
- IDM-01 production import service behavior.
- IDM-06 validation service behavior.
- Sprint 1 API route auth and validation wiring.
- Sprint 2 migration, dispatch service, fulfilment status, and route authorization wiring.
- Sprint 3 migration, configurable ageing buckets, ageing report summaries, data-quality detection, and route authorization wiring.
- V006 migration, GRN service, SRN service, serial history service, repository SQL contracts, and route authorization wiring.
- React shell rendering.

## Linting

Run all lint checks:

```bash
npm run lint
```

Run backend lint only:

```bash
npm run lint --workspace server
```

Run frontend lint only:

```bash
npm run lint --workspace client
```

## Build

Build all workspaces:

```bash
npm run build
```

Currently only the frontend workspace has a build step:

```bash
npm run build --workspace client
```

## API Documentation Summary

### Health

```text
GET /health
```

Returns:

```json
{
  "status": "ok",
  "service": "microtek-idm-api"
}
```

### IDM-01 Production Import

```text
POST /api/idm-01/import/production
```

Required headers for current scaffold auth:

```text
x-user-id: integration_user
x-user-role: admin
x-warehouse-ids: 1,2,3
```

Required permission:

```text
integration:import
```

Example body:

```json
{
  "externalRef": "SAP-PROD-001",
  "source": "SAP",
  "records": [
    {
      "serialNo": "MTK1234567890",
      "productCode": "SKU-INV-1",
      "batchNo": "B-01",
      "warehouseId": 3,
      "sourceInvoiceRef": "INV-1"
    }
  ]
}
```

Behavior:

- Creates or reuses an idempotent inbound `integration_batch`.
- Inserts production serials into `serial_master`.
- Appends `PRODUCTION` rows to `serial_event`.
- Rejects rows with unknown product codes while processing valid rows.
- Treats already processed batches as no-ops.

### IDM-06 Serial Validation

```text
POST /api/idm-06/validate
```

Required headers for current scaffold auth:

```text
x-user-id: operator_1
x-user-role: warehouse_operator
x-warehouse-ids: 5
```

Required permission:

```text
serial:validate
```

Example body:

```json
{
  "serialNo": "MTK1234567890",
  "contextType": "FOUNDATION",
  "warehouseId": 5
}
```

Current validation rules:

- `MALFORMED_SERIAL`
- `NOT_FOUND`
- `WRONG_WAREHOUSE`
- `ALREADY_DISPATCHED`

Every failed validation returns an immediate alert payload and persists an `exception_log` row.

### IDM-05 Dispatch

```text
POST /api/idm-05/dispatches
POST /api/idm-05/dispatches/:dispatchId/scans
POST /api/idm-05/dispatches/:dispatchId/complete
```

Required headers for current scaffold auth:

```text
x-user-id: operator_1
x-user-role: warehouse_operator
x-warehouse-ids: 5
```

Required permission:

```text
dispatch:write
```

The dispatch scan endpoint reuses IDM-06 validation. Accepted scans mark the serial `DISPATCHED`, write a `dispatch_scan` row, append a `CUSTOMER_DISPATCH` event, and update fulfilment status.

### IDM-07 Fulfilment Status

```text
GET /api/idm-07/orders/:invoiceId/status
```

Required permission:

```text
fulfilment:read
```

Current statuses are `PENDING`, `IN_PROGRESS`, and `DISPATCHED`. `PARTIAL` is not encoded because OI-4 is still pending.

### IDM-08 Ageing Report

```text
GET /api/idm-08/ageing?warehouseId=5&productId=10
```

Required permission:

```text
ageing:read
```

The report uses `serial_master.received_at` through the `ageing_serial_snapshot` materialized view. Bucket definitions are configurable in `server/src/idm08/ageingBucketService.js`; current defaults are temporary because OI-8 is unresolved.

### Opening-Stock Reconciliation Foundation

```text
GET /api/idm-08/reconciliation/opening-stock/variance?warehouseId=5&productId=10
```

Required permission:

```text
reconciliation:read
```

This endpoint reads stored variance rows only. It does not decide cutover acceptance, thresholds, approvals, or business outcomes for OI-10.

### IDM-02 GRN

```text
POST /api/idm-02/grns
GET /api/idm-02/grns/:grnId
POST /api/idm-02/grns/:grnId/scans
POST /api/idm-02/grns/:grnId/complete
```

Required permission:

```text
grn:write
```

GRN scans reconcile physical serials against imported sender dispatch documents. Accepted scans mark serials `IN_STOCK`, stamp `received_at`, and append `GRN` events. Discrepancies return alerts and persist exceptions for `SHORT`, `EXCESS`, `WRONG_SERIAL`, and `DUPLICATE_SCAN`.

### IDM-04 SRN

```text
POST /api/idm-04/srns
POST /api/idm-04/srns/:srnId/scans
```

Required permission:

```text
srn:write
```

SRN scans validate returned serials against original dispatch scans, protect against duplicate returns, store configurable condition tags, return stock to the receiving warehouse, and append `SRN` events.

### IDM-09 Serial History

```text
GET /api/idm-09/serials/:serialNo/history
```

Required permission:

```text
serial-history:read
```

Returns a chronological timeline combining append-only `serial_event` rows and visible `exception_log` rows for the serial.

## Common Troubleshooting

### `Invalid environment configuration`

Check that `.env` contains a valid `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, and `LOG_LEVEL`.

### `password authentication failed for user`

Confirm the PostgreSQL user/password in `DATABASE_URL` and that the database exists.

### `relation does not exist`

Run migrations:

```bash
npm run migrate --workspace server
```

### `401 Authentication required`

The current scaffold requires request headers such as `x-user-id` and `x-user-role`. This is not final authentication; it is a Sprint 0/1 auth context placeholder.

### `403 Insufficient permission`

The current role must have the route permission in `server/src/security/rbacPolicy.js`, and warehouse-scoped requests must use an allowed warehouse ID from `x-warehouse-ids`.

### `listen EPERM`

Some sandboxed environments block local port binding. The automated tests use mocked HTTP requests and do not require port binding. Run the dev servers in a normal local environment.

## Current Implementation Status

Sprint 0 complete:

- npm workspace foundation.
- React/Vite shell.
- Express API foundation.
- Environment config validation.
- RBAC scaffold.
- PostgreSQL migration runner.
- V001 reference/RBAC migration.

Sprint 1 started:

- V002 serial core/integration migration.
- IDM-01 production import service and route.
- IDM-06 validation service and route.
- Parameterized repositories for serials, integration batches, and exceptions.
- Default-deny route auth scaffold.

Sprint 2 started:

- V003 invoice/dispatch migration.
- IDM-05 dispatch service and routes.
- IDM-07 fulfilment status service and route.
- Dispatch scan reuse of IDM-06 validation and append-only serial events.
- OI-4 assumptions documented in `docs/sprint-2-assumptions.md`.

Sprint 3 started:

- V004 ageing/reconciliation migration.
- IDM-08 ageing report service and route.
- Configurable ageing bucket business-rule layer.
- Missing `received_at` data-quality detection.
- Opening-stock reconciliation variance-read foundation.
- OI-8 and OI-10 assumptions documented in `docs/sprint-3-assumptions.md`.

Platform hardening completed:

- V005 transaction/concurrency hardening migration.
- Transaction wrappers for production import and dispatch scan/complete write paths.
- Dispatch row locking, conditional serial status updates, duplicate scan protections, and stored-warehouse authorization for dispatch path writes.
- Hardening findings documented in `docs/platform-hardening-report.md`.

Sprint 4 business modules started:

- V006 sender dispatch, GRN, SRN, and history lookup migration.
- IDM-02 GRN service and API.
- IDM-04 SRN service and API.
- IDM-09 serial history service and API.
- OI-1, OI-2, OI-3, OI-5, and OI-6 assumptions documented in `docs/sprint-4-assumptions.md`.

## Known Limitations and Pending Modules

Not implemented:

- Real authentication/session management.
- Final OI-9 role hierarchy.
- Real SAP adapter/API/BAPI/RFC/SFTP integration.
- SAP outbound integrations.
- SAP ageing-feed transport.
- Ageing snapshot refresh scheduling.
- IDM-03 battery pre-billing.
- IDM-10 exception correction portal.
- IDM-11 SFA/DMS APIs.
- Seed scripts.
- CI/CD pipeline files.

Open decisions still needing clarification:

- OI-7 SAP integration mechanism and field-level data contract.
- OI-9 final role hierarchy and permission matrix.
- OI-2 online vs. offline mobile posture.
- OI-10 opening-stock reconciliation threshold and cutover rules.
- OI-8 final ageing buckets and output format.
- OI-5/OI-6 expected concurrent load and scan volume for performance sizing.
