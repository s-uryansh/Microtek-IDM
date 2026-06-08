# Microtek IDM - Project Progress Tracker

**Project:** Basiq360 Inventory & Dispatch Management (IDM)  
**Client:** Microtek  
**Tracker owner:** Project Manager (Basiq360)  
**Status legend:** `Not Started` · `Partially Implemented` · `Backend Complete` · `Frontend Complete` · `Integrated` · `Tested` · `Blocked`  
**Last reviewed:** 2026-06-08

This tracker was updated after reading the repository implementation on 2026-06-07. Statuses below describe actual code present in the repo, not the original sprint plan.

## 1. Functional Modules

| ID | Feature Name | Scope Status | Current Status | Last Updated | Dependencies | Testing Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IDM-01 | SAP -> IDM Production & Factory Dispatch Import | Agreed | Partially Implemented / Integrated for production import | 2026-06-07 | TEC-DB, TEC-AUTH, TEC-INT; OI-7 for full SAP contract | Backend route/service tests; frontend Import Monitor tests; API module tests | `POST /api/idm-01/import/production` imports production serials with idempotent batches, serial creation, serial events, duplicate-row handling, and unknown-product rejections. No real SAP adapter exists. Factory-dispatch/invoice inbound transport is not implemented beyond schema/seed foundations. |
| IDM-02 | Scan-based GRN (Central & Regional Warehouses) | New | Integrated / Tested | 2026-06-07 | IDM-06, V006, warehouse RBAC, sender dispatch document data | Backend service/route tests; frontend GRN page tests; API module tests | Create/get/scan/complete APIs and GRN page exist. Handles MATCHED, SHORT, EXCESS, WRONG_SERIAL, DUPLICATE_SCAN. Uses stored GRN warehouse authorization. |
| IDM-03 | Battery Segment Pre-Billing Scan | New | Integrated / Tested | 2026-06-07 | IDM-06, V007, invoice/invoice_line, warehouse RBAC | Backend service/route tests; frontend Battery page tests; API module tests; scanner hook/component tests | Commit/status APIs and Battery page exist. Validates battery product line, IN_STOCK serial, product match, duplicate commit, and records PRE_BILLING event. Battery page now uses the shared continuous scan session after invoice line entry. |
| IDM-04 | SRN - Customer Returns with Serial Scan | New | Integrated / Tested | 2026-06-07 | IDM-05 dispatch scans, IDM-06, V006, OI-3 final condition taxonomy | Backend service/route tests; frontend SRN page tests; API module tests | Create/scan APIs and SRN page exist. Original-dispatch validation and duplicate-return protection exist. No SRN complete endpoint exists. Temporary tags: SALEABLE, DEFECTIVE, REPAIR. |
| IDM-05 | Warehouse Dispatch with Serial Scan | Agreed | Integrated / Tested | 2026-06-07 | IDM-06, V003/V005, invoice data, TEC-INT for SAP outbound | Backend service/route tests; frontend Dispatch page tests; API module tests | Create/scan/complete APIs and Dispatch page exist. Serial validation, dispatch locking, duplicate protection, serial status/event writes, and invoice/dispatch status updates exist. SAP outbound transport is absent. |
| IDM-06 | Real-Time Serial Validation + Exception Logging | Agreed | Backend Complete / Tested | 2026-06-07 | V002, serial master, exception log, RBAC | Backend service/route tests; frontend API module tests | `POST /api/idm-06/validate` exists and is reused by backend scan workflows. Frontend has an API module but no standalone validation page. Rules: MALFORMED_SERIAL, NOT_FOUND, WRONG_WAREHOUSE, ALREADY_DISPATCHED, PRODUCT_INVOICE_MISMATCH. |
| IDM-07 | Order Fulfilment Status Marking | Agreed | Integrated / Tested | 2026-06-07 | IDM-05, invoice/dispatch data, OI-4 final partial dispatch rule | Backend service/route tests; frontend Fulfilment page tests; API module tests | `GET /api/idm-07/orders/:invoiceId/status` and Fulfilment page exist. Statuses are PENDING, IN_PROGRESS, DISPATCHED. `committedQuantity` from battery pre-billing is included. PARTIAL is not encoded. |
| IDM-08 | Inventory Ageing Report + Opening Stock Variance | Agreed (customisation) | Integrated / Tested for portal report and variance read | 2026-06-08 | V004 materialized view, serial receipt dates, OI-8/OI-10, TEC-INT for SAP ageing feed | Backend service/route tests; frontend Ageing page and dashboard tests; API module tests | Ageing API, dashboard widgets, Ageing page, bucket service, missing receipt-date count, opening-stock variance read endpoint, paginated ageing API response, and materialized-view refresh scheduling exist. SAP custom ageing feed is absent. Materialized view refresh is scheduled via `startAgeingRefreshSchedule`; interval configurable via `AGEING_REFRESH_INTERVAL_MS`. |
| IDM-09 | Serial Number Transaction History Report | New | Integrated / Tested | 2026-06-07 | `serial_event`, `exception_log`, V006 indexes | Backend service/route tests; frontend Serial History page tests; API module tests | Serial history API and page exist. Timeline merges serial events and exception rows chronologically. |
| IDM-10 | Exception Correction via Web Portal | Agreed | Integrated / Tested | 2026-06-07 | `exception_log`, `serial_event`, RBAC, warehouse-scope resolution | Backend service/route tests; frontend Exceptions page tests; API module tests | List/get/correct APIs and Exception Portal page exist. Correction requires reason, is transaction-wrapped, returns conflict on concurrent correction, and appends CORRECTION serial events when a serial can be resolved. |
| IDM-11 | SFA / DMS Integration | Out of Scope / Future | Not Started | 2026-06-07 | Stable IDM APIs and external integration contract | No tests | No backend route/service/repository, migration, frontend API module, or UI exists. |

## 2. Technical / Cross-Cutting Components

| ID | Component | Current Status | Last Updated | Testing Status | Notes |
| --- | --- | --- | --- | --- | --- |
| TEC-DB | PostgreSQL schema and migrations | Integrated / Tested | 2026-06-07 | Migration contract tests for V001-V008 and paired rollback scripts | Versioned SQL migrations exist through V008. Database includes serial, dispatch, GRN, SRN, ageing/reconciliation, battery pre-billing, auth session, RBAC, and audit structures. |
| TEC-INT | SAP / external integration layer | Partially Implemented | 2026-06-07 | IDM-01 import service tests and integration batch repository tests | Inbound production import batch architecture exists. No real SAP transport, no factory-dispatch/invoice inbound adapter, no confirmed-serial outbound transport, and no SAP ageing feed. |
| TEC-AUTH | Authentication and authorization | Integrated / Tested for pilot | 2026-06-08 | Auth service/routes/token/password/rate-limit/middleware tests; RBAC tests; frontend auth tests; API auth-expiry tests | Cookie-backed login, persistent cookie expiry aligned to server session expiry, bcrypt hashes, JWT session token, server-side session table, logout revocation, Redis-backed login rate limiter; multi-instance safe, DB-authoritative warehouse scope, protected frontend routes, auth-expired handling, and RBAC compatibility exist. Final production hierarchy/MFA/SSO/user admin remains open under OI-9. |
| TEC-WEB | IDM Web Portal | Integrated / Tested | 2026-06-07 | Frontend API/component/auth/feature tests; scanner hook/component tests | React/Vite portal has protected router, dashboard, all implemented feature pages, shared components, API modules, error boundaries, persistent session restore, mobile-responsive scan workflows, browser camera scanning, ZXing fallback, and keyboard-wedge scanner support. It still relies on numeric ID entry for several workflows; top-bar search/notifications are visual only. |
| TEC-APP | Mobile scanning/operator experience | Partially Implemented / Tested for web portal | 2026-06-07 | `useScanner`, `useScanSession`, `ScanCamera`, ScanInput, GRN/Dispatch/SRN/Battery feature tests | No native mobile app exists. React web portal supports mobile-responsive warehouse scan flows, browser camera scanning via `MediaDevices`, native `BarcodeDetector`, `@zxing/browser` fallback, and hardware keyboard-wedge scanning. Offline queue/sync and native device integration are absent. |
| TEC-OBS | Logging, audit, monitoring | Implemented (basic) | 2026-06-08 | Covered indirectly through service/repository tests | `pino` logger exists; exception log and serial event audit trail are implemented. Basic request logger, `/api/health`, and in-process `/api/metrics` counters exist. External metrics export, alerting, tracing dashboards, and log shipping remain absent. |

## 3. Project Phases

| Phase | Milestone | Current Status | Target Window | Last Updated | Notes |
| --- | --- | --- | --- | --- | --- |
| Discovery | Requirements, open item closure, architecture freeze | In-Progress / Not closed | Weeks 1-2 | 2026-06-07 | Code has progressed despite unresolved OI-1 through OI-11. Discovery decisions still block production/mobile/integration readiness. |
| Pilot | Pilot web/API foundation | Partially Ready | Weeks 3-12 | 2026-06-07 | Backend and web portal for IDM-01 through IDM-10 current code paths are implemented and tested. Wave 4 web scanning improves phone/rugged-browser pilot usability. Pilot still lacks selected pilot warehouse, real SAP integration, offline operating model, load targets, and production auth hierarchy. |
| Rollout | Operational rollout across warehouses | Not Ready | Weeks 13-22 | 2026-06-07 | Rollout is blocked by offline decisions, SAP outbound/inbound contracts, scanner hardware/browser certification, load testing, materialized-view refresh scheduling, training/runbook work, and production auth hardening. |
| Expansion | SFA/DMS and future integrations | Not Started | Post go-live | 2026-06-07 | IDM-11 has no code. |

## 4. Open Items Register

| Ref | Open Item | Owner | Status | Last Updated | Current impact |
| --- | --- | --- | --- | --- | --- |
| OI-1 | Scanning hardware (handheld vs mobile; barcode vs QR) | Client | Open | 2026-06-07 | Blocks mobile/scanner UX and rollout hardware validation. |
| OI-2 | Connectivity at regional warehouses / offline mode | Client | Open | 2026-06-07 | Blocks mobile/offline architecture and pilot operating model. |
| OI-3 | SRN condition taxonomy | Client | Open | 2026-06-07 | Current tags are temporary and code-configured. |
| OI-4 | Partial dispatch handling | Client | Open | 2026-06-07 | Database and service use PENDING, IN_PROGRESS, DISPATCHED only. |
| OI-5 | Concurrent users per warehouse | Client | Open | 2026-06-07 | Blocks sizing and load/concurrency acceptance testing. |
| OI-6 | Expected daily scan volume | Client | Open | 2026-06-07 | Blocks performance targets and capacity planning. |
| OI-7 | SAP integration mechanism and field contract | Client + SAP Team | Open | 2026-06-07 | Blocks real SAP inbound/outbound transports and factory-dispatch/invoice integration. |
| OI-8 | Ageing buckets and output format | Client | Open | 2026-06-07 | Current ageing buckets are defaults in code. |
| OI-9 | User role hierarchy / production auth model | Client | Open | 2026-06-07 | Pilot auth exists; production hierarchy, MFA/SSO, and user management are unresolved. |
| OI-10 | Opening stock reconciliation process | Client + Basiq360 | Open | 2026-06-07 | Code can read stored variance only; no threshold/approval/cutover workflow exists. |
| OI-11 | Pilot warehouse selection | Client | Open | 2026-06-07 | Blocks pilot deployment and representative UAT. |

## 5. Implementation Notes

| Date | Note |
| --- | --- |
| 2026-06-07 | Repository audit completed. Confirmed backend routes/services/repositories for IDM-01 through IDM-10 current code paths, React feature pages for dashboard and IDM-01/02/03/04/05/07/08/09/10, cookie-backed pilot authentication, V001-V008 migrations, and no IDM-11 implementation. |
| 2026-06-07 | Reclassified IDM-01 and TEC-INT as partially implemented because only production import exists; no real SAP adapter, no factory-dispatch/invoice inbound adapter, and no SAP outbound transport exist. |
| 2026-06-07 | Reclassified TEC-WEB as integrated/tested for current portal pages, while documenting remaining limitations around numeric ID workflows, visual-only top-bar search/notifications, and no mobile app. |
| 2026-06-07 | Reclassified pilot as partially ready rather than complete because business open items, real SAP integration, mobile/offline support, load testing, materialized-view scheduling, and production auth decisions remain unresolved. |
| 2026-06-07 | Wave 4 implemented mobile-responsive web scan workflows for GRN, Dispatch, SRN, and Battery; added shared scanner/session hooks, browser camera scanner support, keyboard-wedge scanner support, duplicate detection, scan pause/resume, and scanner tests. Offline sync remains assessment-only. |
| 2026-06-07 | Post-Wave 4 auth/scanner upgrade added persistent cookie expiry, frontend auth-expired handling on 401, ZXing camera scanner fallback when native BarcodeDetector is absent, permission/unavailable scanner states, and restricted CORS to configured origin. |
| 2026-06-08 | Wave 5 workflow completion preserved manual ID fields and added/verified operator fallback paths: QR/barcode scan, manual entry, CSV import, and CSV export for active scanner/lookup workflows. Added `docs/CSV_FIELD_REFERENCE.md`. Battery and Dispatch now disable scan controls until required invoice line context is selected or manually entered. Fulfilment, Serial History, and Exceptions now support scan/manual/CSV lookup inputs and CSV result export. |
| 2026-06-08 | Android testing update: HTTPS/ngrok resolved secure-context camera blocking and QR scanning starts. Battery QR scans require invoice line context before serial commit. Duplicate same-code camera frames are suppressed by scan-session duplicate cooldown. Scanner diagnostics now distinguish secure context, permission denial, missing camera, MediaDevices support, camera access blocking, and decoder initialization failures. |
| 2026-06-08 | Security/workflow fixes retained: IDM-03 battery status, IDM-07 fulfilment status, and IDM-09 serial history enforce warehouse scope; SRN validation allows legitimately DISPATCHED serials only for SRN return context. |
| 2026-06-08 | Production hardening pass: Redis-backed rate limiter (Task 1), ageing view scheduler (Task 2), standardized error shapes (Task 3), CSV formula injection sanitization (Task 4), DB-authoritative warehouse scope (Task 5), pagination on exceptions and ageing endpoints (Task 6), Dockerfile + docker-compose + GitHub Actions CI (Task 7), request logger + in-process metrics + /api/health endpoint (Task 8). |

## 6. Remaining Backlog

### High Priority

- Finalize OI-7 SAP integration contract and implement real inbound/outbound transports.
- Select pilot warehouse scope (OI-11) and run pilot smoke/UAT against seeded and representative data.
- Define production auth/RBAC hierarchy (OI-9) and harden auth for production use.
- Certify mobile browser/scanner hardware choices and decide offline scanning posture (OI-1/OI-2).
- Validate persistent session expiry and scanner fallback on actual pilot Android/Edge/Chromium devices.

### Medium Priority

- Add live PostgreSQL load/concurrency test harness once OI-5/OI-6 are closed.
- Add lookup/list UX for invoices, invoice lines, warehouses, dispatch docs, GRNs, SRNs, and import batches.
- Add external metrics export (Prometheus/Datadog), log shipping, and alerting (in-process metrics now exist; external stack absent).
- Replace in-process metrics with Prometheus exporter before multi-instance deploy.
- Restrict `/api/metrics` to internal network / authenticated access before production.

### Future Scope

- Native mobile scanner application, if the web portal is insufficient after pilot.
- Offline scan queue and sync engine.
- IDM-11 SFA/DMS integration.
- Deployment automation beyond the basic Docker/GitHub Actions CI scaffold.
- Training materials, runbook, and admin guide.
