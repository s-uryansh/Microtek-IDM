# Microtek IDM Server

The server is an Express API for Microtek IDM. It exposes authenticated, RBAC-protected IDM module endpoints backed by PostgreSQL.

## Architecture

- `src/app.js`: Express app composition, middleware, route registration.
- `src/server.js`: process entry point.
- `src/config.js`: environment validation.
- `src/auth/`: login, logout, token, password hashing, session repository, rate limiting.
- `src/http/authContext.js`: auth and permission middleware.
- `src/security/rbacPolicy.js`: deny-by-default RBAC policy.
- `src/idm*/`: module routes and services.
- `src/db/`: repository layer, pool, migration runner, seed script.

Routes call services. Services own business rules. Repositories own SQL and use parameterized `pg` queries.

## Authentication

Login verifies bcrypt password hashes, creates an `auth_session` row, signs a session token, and sets it in the `idm_auth` HTTP-only cookie. The cookie expiry matches the backend session expiry so sessions persist through refresh and browser reopen until expiry. Logout revokes the session and clears the cookie.

`GET /api/auth/me` verifies the token, rejects expired/revoked sessions, reloads the user, and returns the public user context.

## RBAC

RBAC is enforced server-side. Permissions are checked by `requirePermission`, and warehouse scope is checked by the policy or by module services where object-level warehouse lookup is required.

Roles:

- `admin`
- `supervisor`
- `warehouse_operator`

## API Overview

Authentication:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

IDM:

- `POST /api/idm-01/import/production`
- `POST /api/idm-02/grns`
- `GET /api/idm-02/grns/:grnId`
- `POST /api/idm-02/grns/:grnId/scans`
- `POST /api/idm-02/grns/:grnId/complete`
- `POST /api/idm-03/battery/commit`
- `GET /api/idm-03/battery/invoices/:invoiceId/status`
- `POST /api/idm-04/srns`
- `POST /api/idm-04/srns/:srnId/scans`
- `POST /api/idm-05/dispatches`
- `POST /api/idm-05/dispatches/:dispatchId/scans`
- `POST /api/idm-05/dispatches/:dispatchId/complete`
- `POST /api/idm-06/validate`
- `GET /api/idm-07/orders/:invoiceId/status`
- `GET /api/idm-08/ageing`
- `GET /api/idm-08/reconciliation/opening-stock/variance`
- `GET /api/idm-09/serials/:serialNo/history`
- `GET /api/idm-10/exceptions`
- `GET /api/idm-10/exceptions/:exceptionId`
- `POST /api/idm-10/exceptions/:exceptionId/correct`

## Database And Migrations

Forward migrations exist through `V008__authentication.sql`, with rollback scripts `U001` through `U008`.

Run migrations:

```bash
npm run migrate --workspace server
```

Seed development data:

```bash
npm run seed:dev
```

## Security Defaults

- Helmet is enabled.
- CORS is restricted to `CORS_ORIGIN`.
- JSON body limit is `1mb`.
- Auth uses HTTP-only cookies.
- Login rate limiting is in memory.
- Production startup rejects the default development auth secret.

## Testing

Run server tests:

```bash
npm run test --workspace server
```

Run lint:

```bash
npm run lint --workspace server
```
