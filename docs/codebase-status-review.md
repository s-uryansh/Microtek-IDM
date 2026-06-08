# Codebase Status Review

Last audited: 2026-06-07

## 1. Implemented Modules

IDM-02, IDM-03, IDM-04, IDM-05, IDM-07, IDM-08, IDM-09, and IDM-10 have backend routes/services and frontend pages wired through the shared API client. They also have backend and frontend test coverage for the implemented paths.

IDM-06 is backend complete and tested. It is integrated into backend scan workflows and has a frontend API module, but there is no standalone validation page.

## 2. Partially Implemented Modules

IDM-01 is partially implemented. Production import exists at `POST /api/idm-01/import/production` with idempotent batch handling and an Import Monitor page. Full SAP production/factory-dispatch/invoice transport is not implemented.

IDM-08 is integrated for portal ageing and opening-stock variance reads, but the SAP ageing feed and refresh scheduling are not implemented.

## 3. Missing Modules

IDM-11 is not started. There is no backend route, service, repository, migration, frontend API module, page, or test coverage.

## 4. Documentation Inaccuracies Found And Corrected

- `README.md` described older sprint status and header-based auth troubleshooting; it now reflects the current web/API pilot implementation and cookie-backed auth.
- `docs/backend-readiness-report.md` predated V008 authentication and listed no real authentication/rate limiting as gaps; it now reflects pilot auth and current backend limitations.
- `docs/frontend-stability-review.md` stated missing error boundaries and localStorage auth defaults; it now reflects route fallbacks, error boundaries, cookie-backed auth, and no auth-header injection.
- `docs/sprint-0-assumptions.md`, `docs/sprint-1-assumptions.md`, and `docs/sprint-4-assumptions.md` preserved historical scope boundaries without current context; they now mark those sections as historical and note current implementation changes.
- `Plan/FRONTEND_ARCHITECTURE.md` was framed as design/awaiting approval and contained planned components/folders that differed from code; it now describes the implemented frontend architecture.

## 5. Progress Tracker Inaccuracies Fixed

- IDM-01 changed from backend-complete wording to partial implementation because only production import exists.
- TEC-INT changed to partial implementation because real SAP adapters/transports are absent.
- TEC-WEB now reflects the implemented React portal and its limitations.
- TEC-DB now reflects V001-V008 instead of earlier V001-V006 wording.
- Pilot and rollout phases now reflect readiness constraints instead of implying backend completion is enough for pilot readiness.

## 6. Technical Debt

- No real SAP transport for inbound factory dispatch/invoice data, confirmed dispatch serials, or SAP ageing feeds.
- No mobile app or offline sync.
- No materialized-view refresh scheduler.
- No live PostgreSQL load/concurrency harness.
- No CI/CD pipeline files.
- Error response formats are inconsistent in some routes.
- Several frontend workflows require manual numeric ID entry instead of lookup/select flows.
- Dashboard ageing widgets use a hardcoded warehouse ID.
- Top-bar search and notifications are visual only.

## 7. Open Blockers

OI-1 through OI-11 remain open. The highest-impact blockers are OI-7 SAP integration contract, OI-9 production auth hierarchy, OI-1/OI-2 scanning hardware and offline posture, OI-5/OI-6 load targets, and OI-11 pilot warehouse selection.

## 8. Pilot Readiness Status

The codebase is pilot-demo ready for web/API workflows in a controlled development environment after migrations and seed data. It is not production-pilot ready until SAP integration, pilot warehouse selection, mobile/offline decisions, load targets, refresh scheduling, and production auth decisions are closed.
