# Microtek IDM — Project Progress

**Client:** Microtek | **Solution:** Basiq360 IDM | **Status:** Demo Ready
**Last Updated:** 2026-06-22

---

## Environment

| Service | URL | Status |
|---------|-----|--------|
| Web Portal | http://localhost:8081 | Running |
| API | http://localhost:4001/api | Running |
| PostgreSQL | localhost:5435 | Running |
| Redis | localhost:6379 | Running |

**Stack:** `docker compose up --build` from project root

**Logins:**
| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| supervisor_1 | admin123 | Supervisor |
| operator_1 | admin123 | Warehouse Operator |

---

## Module Build Status

| # | Module | Backend | Frontend | Demo Data | Notes |
|---|--------|---------|----------|-----------|-------|
| IDM-01 | SAP Production Import | Done | Done | **Rich** | 8 batches; 1 FAILED with rejections; pending batch |
| IDM-02 | GRN — Goods Receipt | Done | Done | **Rich** | 4 CLOSED + 1 IN_PROGRESS; SHORT + WRONG_SERIAL scans |
| IDM-03 | Battery Pre-Billing | Done | Done | **Rich** | Fully pre-billed (4/4) + partially pre-billed (3/6) invoices |
| IDM-04 | SRN + Condition Tags | Done | Done | **Rich** | 4 SRNs; SALEABLE/DEFECTIVE/REPAIR returns; lifecycle re-dispatch |
| IDM-05 | Warehouse Dispatch | Done | Done | **Rich** | DISPATCHED / IN_PROGRESS / PENDING across 4 warehouses |
| IDM-06 | Serial Validation | Done | Done | **Rich** | Via dispatch/GRN exception trail in IDM-10 |
| IDM-07 | Fulfilment Status | Done | Done | **Rich** | DISPATCHED / PARTIALLY_DISPATCHED / PENDING invoices |
| IDM-08 | Ageing Report | Done | Done | **Rich** | 185 IN_STOCK in all 4 ageing buckets; MV refreshed |
| IDM-09 | Serial History | Done | Done | **Rich** | DEMO-LIFECYCLE-0001 — 7 events full lifecycle |
| IDM-10 | Exception Management | Done | Done | **Rich** | 19 exceptions: 8 OPEN / 11 resolved across all rule codes |

---

## Task Log

### 2026-06-22 — Environment Setup
- [x] Docker Desktop WSL2 integration enabled
- [x] Port conflicts resolved (5432→5435, 4000→4001, 8080→8081)
- [x] `IMPORT_WEBHOOK_SECRET` blank-string bug fixed in `.env`
- [x] Client Dockerfile updated to accept `VITE_API_BASE_URL` build arg
- [x] Full stack running via `docker compose up --build`
- [x] Dev seed data loaded — minimal baseline
- [x] Login verified: admin/admin123 → Dashboard visible

### 2026-06-22 — Demo Data & Dashboard
- [x] `server/src/db/seed-demo.js` written — comprehensive seed covering all 10 IDM modules
- [x] `npm run seed:demo` / `seed:demo:teardown` scripts added to server + root package.json
- [x] Demo seed executed successfully via `docker cp` + `docker exec`
- [x] Ageing materialized view refreshed (185 IN_STOCK rows, all 4 buckets populated)
- [x] 8 open exceptions + 11 resolved visible in IDM-10
- [x] DEMO-LIFECYCLE-0001 has 7 serial events for serial history demo

**Demo DB snapshot (2026-06-22):**
| Metric | Count |
|--------|-------|
| IN_STOCK serials | 185 |
| DISPATCHED serials | 18 |
| IN_TRANSIT serials | 12 |
| RETURNED serials | 2 |
| Open exceptions | 8 |
| Resolved exceptions | 11 |
| GRNs | 5 (4 CLOSED + 1 IN_PROGRESS) |
| Invoices | 18 |
| SRNs | 4 |

**Re-run seed:** `docker exec microtekinventorymanagement-server-1 node /app/server/src/db/seed-demo.js`
**Teardown:** `docker exec microtekinventorymanagement-server-1 node /app/server/src/db/seed-demo.js teardown`

### 2026-06-22 — UX Improvements (Session 3)

**Dashboard rebuilt (IDM-00):**
- [x] New `GET /api/idm-00/dashboard/summary` backend endpoint (dashboardRepository + dashboardService + dashboardRoutes)
- [x] Admin scope: all warehouses; operator scope: their warehouses only
- [x] Dashboard KPI row: 6 live KPIs (In Stock, Open Exceptions, Resolved Exceptions, In Transit, GRNs In Progress, Dispatches In Progress)
- [x] Hardcoded `warehouseId: 3` bug removed — now fully dynamic via auth context
- [x] Hardcoded `Exceptions Resolved: 0` fixed — now live from DB (currently 11)
- [x] New charts: Donut (inventory status breakdown), HorizontalBar (exceptions by rule, stock by warehouse)
- [x] Ageing bar chart now driven by live summary data
- [x] Recent GRNs widget (last 5 with status badge + timestamp)
- [x] Recent Dispatches widget (last 5 with invoice ID + status badge)

**Status badges:**
- [x] `normalizeStatus` regex fixed (`[\s_]+`) — `IN_PROGRESS`, `IN_TRANSIT` etc. now render colored instead of gray
- [x] 13 new CSS badge classes: SHORT, WRONG_SERIAL, DEFECTIVE, IMPORT_FAILED, NOT_FOUND (red); EXCESS, REPAIR, DUPLICATE_SCAN (amber); DISMISSED (muted); SALEABLE (green); IN_TRANSIT, PRODUCED (blue)
- [x] `STATUS_VALUES` in DataTable expanded with 11 new statuses

**Global search:**
- [x] TopBar search input wired — Enter navigates to `/serials?q=` (serial number) or `/fulfilment?q=` (invoice number)
- [x] SerialHistoryPage reads `?q=` URL param and auto-triggers search on mount
- [x] FulfilmentPage reads `?q=` URL param and auto-triggers search on mount

**Toast + Confirm system:**
- [x] `ToastProvider` (React context) + `useToast()` hook — global toast notifications
- [x] `ConfirmDialog` component — modal with Escape/backdrop dismiss
- [x] `App.jsx` wrapped with ToastProvider
- [x] GRNPage: confirm dialog before "Complete Session" + success toast
- [x] ExceptionsPage: confirm dialog before "Correct Exception" + success toast
- [x] ConditionPage: confirm dialog before SALEABLE retag + toast on all retags

**Live API data (verified):**

| KPI | Value |
|-----|-------|
| In Stock | 185 serials |
| In Transit | 12 serials |
| Dispatched | 18 serials |
| Returned | 2 serials |
| Open Exceptions | 9 |
| Resolved Exceptions | 11 |
| Ageing 0-30d | 50 |
| Ageing 31-60d | 97 |
| Ageing 61-90d | 23 |
| Ageing 91+d | 14 |

---

## Known Limitations

| Item | Detail |
|------|--------|
| SAP transport | Webhook/CSV import only; no live BAPI/RFC/middleware |
| Mobile app | Responsive web portal, not a native/offline app |
| Camera scanning | Requires HTTPS; use hardware wedge or text entry for demo |
| Offline mode | Not implemented; requires stable internet at all warehouses |
| SAP ageing export fields | Field mapping provisional; pending client SAP team sign-off |

---

## Open Items (from Scope Document)

| # | Item | Status |
|---|------|--------|
| 1 | Scanning hardware (barcode vs QR, device type) | Pending client |
| 2 | Connectivity / offline mode at regional warehouses | Pending client |
| 3 | SRN condition tags (SALEABLE/DEFECTIVE/REPAIR) | Implemented — confirm with client |
| 4 | Partial dispatch handling | Implemented — confirm with client |
| 5 | Concurrent users per warehouse | Pending client |
| 6 | Daily scan volume | Pending client |
| 7 | SAP integration mechanism (API/BAPI/RFC) | Pending client — largest remaining build |
| 8 | Ageing bucket thresholds and export format | Implemented (0-30/31-60/61-90/91+) — confirm |
| 9 | User roles and access hierarchy | Implemented (admin/supervisor/operator) — confirm |
| 10 | Opening stock reconciliation / go-live migration | Pending client |
| 11 | Pilot warehouse selection | Pending client |

---

## Architecture Notes

- **Layering:** Route → Service → Repository. SQL only in repositories.
- **RBAC:** Deny-by-default. Warehouse-scoped. DB-seeded via migration V013.
- **Serial lifecycle:** PRODUCED → IN_TRANSIT → IN_STOCK → DISPATCHED → RETURNED
- **Audit trail:** Every workflow appends `serial_event` rows and raises `exception_log` entries.
- **Concurrency:** Per-dispatch row locks + partial unique indexes guard against duplicate scans.
- **Ageing:** 12-hour snapshot refresh (configurable via `AGEING_REFRESH_INTERVAL_MS`).
