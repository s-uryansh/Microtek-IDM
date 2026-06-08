# Backend Readiness Report

**Project:** Microtek IDM  
**Last audited:** 2026-06-08  
**Status:** Backend implemented for IDM-01 through IDM-10 current code paths; not production/integration complete

## Implemented Backend Modules

| Module | Status | Routes |
| --- | --- | --- |
| IDM-01 | Partial | `POST /api/idm-01/import/production` |
| IDM-02 | Backend complete for current path | `POST /api/idm-02/grns`, `GET /api/idm-02/grns/:grnId`, `POST /api/idm-02/grns/:grnId/scans`, `POST /api/idm-02/grns/:grnId/complete` |
| IDM-03 | Backend complete for current path | `POST /api/idm-03/battery/commit`, `GET /api/idm-03/battery/invoices/:invoiceId/status` |
| IDM-04 | Backend complete for current path | `POST /api/idm-04/srns`, `POST /api/idm-04/srns/:srnId/scans` |
| IDM-05 | Backend complete for current path | `POST /api/idm-05/dispatches`, `POST /api/idm-05/dispatches/:dispatchId/scans`, `POST /api/idm-05/dispatches/:dispatchId/complete` |
| IDM-06 | Backend complete for current path | `POST /api/idm-06/validate` |
| IDM-07 | Backend complete for current path | `GET /api/idm-07/orders/:invoiceId/status` |
| IDM-08 | Backend complete for portal report/read path | `GET /api/idm-08/ageing`, `GET /api/idm-08/reconciliation/opening-stock/variance` |
| IDM-09 | Backend complete for current path | `GET /api/idm-09/serials/:serialNo/history` |
| IDM-10 | Backend complete for current path | `GET /api/idm-10/exceptions`, `GET /api/idm-10/exceptions/:exceptionId`, `POST /api/idm-10/exceptions/:exceptionId/correct` |
| IDM-11 | Not started | None |

## Infrastructure

- Migrations `V001` through `V008` and paired rollbacks `U001` through `U008` are present.
- Auth uses bcrypt password hashes, signed session tokens, server-side `auth_session`, HTTP-only `idm_auth` cookie, logout revocation, Redis-backed login rate limiting, and DB-authoritative warehouse scope.
- RBAC is deny-by-default with warehouse scope enforcement.
- Repositories use parameterized `pg` queries.
- Multi-write workflows use transaction wrappers where implemented.
- `serial_event` and `exception_log` provide audit trails.

## Remaining Backend Gaps

- No IDM-11 implementation.
- No real SAP adapter/transport.
- No confirmed-serial SAP outbound transport.
- No SAP ageing feed.
- No mobile/offline sync backend.
- No live PostgreSQL load/concurrency test harness.
- No external observability stack for metrics export, log shipping, alerting, or tracing.

## Post-Hardening Status (2026-06-08)

- Redis-backed rate limiter: done.
- Ageing view refresh schedule: done.
- Error shape standardization: done.
- CSV formula injection: done.
- Warehouse scope DB re-fetch: done.
- Pagination on exceptions/ageing: done.
- Docker + CI: done.
- Basic observability: done.

## SAP Integration Readiness (Post-Gap Analysis)

- **Inbound import endpoint:** Hardened with optional HMAC-SHA256 webhook signature verification (`X-IDM-Signature` header), source labelling (`X-Import-Source` header), and full rejection detail with `batchId`, `importedAt`, `sourceLabel`, and `rejectedRows` array in the response. Ready to receive from any SAP adapter.
- **Ageing export:** `GET /api/idm-08/ageing/export/sap` endpoint ready with SAP-conventional field names (`SERIAL_NO`, `MATNR`, `LGORT`, `WADAT`, `AGE_DAYS`, `BUCKET`) and `X-IDM-Export-Timestamp` / `X-IDM-Record-Count` response headers. SAP field mapping is provisional pending OI-7 closure.
- **Ageing export (JSON/CSV):** `GET /api/idm-08/ageing/export` supports `format=json` and `format=csv` with pagination (limit/offset, max 5000).
- **Ageing summary:** `GET /api/idm-08/ageing/summary` provides per-warehouse bucket counts for the Import Monitor dashboard widget.
- **Outbound confirmed serials:** `GET /api/idm-05/dispatches/:dispatchId/confirmed-serials`, `GET /api/idm-05/dispatches/export/pending-sap-sync`, and `PATCH /api/idm-05/dispatches/:dispatchId/sap-synced` endpoints are ready. Adapter build blocked on OI-7.
- **Import Monitor UI:** Operational at `/imports` with three tabs: Import History (batch listing + rejection drill-down), Manual Import (CSV/JSON input), and Ageing Summary (per-warehouse bucket table with refresh).
- **Remaining:** Actual SAP adapter/transport build (blocked on OI-7).

## Pilot Readiness

The backend is suitable for controlled development/demo pilot workflows using migrations and refreshed seed data. Core infrastructure hardening is complete for the current pilot code paths. Remaining pilot blockers are business/open-item driven: scanner hardware certification (OI-1), offline sync architecture (OI-2), SAP integration contract (OI-7), production auth hierarchy/MFA/user administration (OI-9), pilot warehouse selection (OI-11), and an external observability stack.
