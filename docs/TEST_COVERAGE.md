# Test Coverage Report

Generated from `client/test` and `server/test`.

Verification baseline:

- Client: `npm test` in `client/` passed with 31 test files and 187 passing tests.
- Server: `npm test` in `server/` passed with 41 test files, 199 passing tests, and 2 todo tests.
- Coverage percentages below are scenario-coverage estimates from reviewed test intent, not instrumented line/branch coverage.

## Summary Table

| Feature/Module | Total Test Cases | Status | Coverage Percentage |
| --- | ---: | --- | ---: |
| Platform Health, Config, Migrations, Scheduling | 31 | Pass | 86% |
| Authentication, Session, RBAC, CORS | 36 | Pass | 90% |
| IDM-01 Production Import and Webhook Verification | 13 | Pass | 84% |
| IDM-02 GRN | 11 | Pass | 88% |
| IDM-03 Battery Pre-Bill | 20 | Pass | 87% |
| IDM-04 SRN and Condition Tags | 13 | Pass | 86% |
| IDM-05 Dispatch | 21 | Pass | 88% |
| IDM-06 Serial Validation | 10 | Pass | 86% |
| IDM-07 Fulfilment Status | 11 | Pass | 84% |
| IDM-08 Ageing and Reconciliation | 19 | Pass with 2 Todo | 76% |
| IDM-09 Serial History | 11 | Pass | 84% |
| IDM-10 Exceptions and Corrections | 41 | Pass | 91% |
| Lookup and Warehouse Scope | 10 | Pass | 86% |
| Client API Layer | 48 | Pass | 88% |
| Frontend App Shell, Auth UI, Navigation | 24 | Pass | 86% |
| Shared Frontend Components and Charts | 41 | Pass | 83% |
| Scanner Hooks and Scan UI | 22 | Pass | 87% |
| Frontend Operations Workflows | 22 | Pass | 82% |
| Frontend Monitoring Workflows | 36 | Pass | 81% |
| CSV Utilities and Export Safety | 12 | Pass | 90% |

## Detailed Breakdown

### Platform Health, Config, Migrations, Scheduling

- [ ] TC-PLAT-001 / Health endpoint
  - Description: Verifies `/api/health` returns a minimal operational health response.
  - Priority: High
  - Status: Passed

- [ ] TC-PLAT-002 / Unknown route error hygiene
  - Description: Confirms unknown routes do not expose stack traces.
  - Priority: High
  - Status: Passed

- [ ] TC-PLAT-003 / CORS preflight allowlist
  - Description: Allows configured frontend origins and blocks reflection of unconfigured origins.
  - Priority: High
  - Status: Passed

- [ ] TC-PLAT-004 / Environment validation
  - Description: Validates required environment variables, production auth secret rules, and fail-closed config behavior.
  - Priority: High
  - Status: Passed

- [ ] TC-PLAT-005 / Base migrations
  - Description: Verifies reference, RBAC, Sprint 1, Sprint 2, Sprint 3, business module, and hardening migrations plus paired rollbacks.
  - Priority: High
  - Status: Passed

- [ ] TC-PLAT-006 / Ageing refresh scheduler
  - Description: Confirms scheduled refresh starts without immediate execution, runs interval refresh, logs errors, and stops cleanly.
  - Priority: Medium
  - Status: Passed

### Authentication, Session, RBAC, CORS

- [ ] TC-AUTH-001 / Password security
  - Description: Validates bcrypt hashing and password verification without returning plaintext.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-002 / Session token integrity
  - Description: Creates, verifies, and rejects tampered session tokens.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-003 / Login and logout routes
  - Description: Covers auth cookie creation, structured login failures, current-user lookup, expired session rejection, logout revocation, and login rate limiting.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-004 / Auth service credential handling
  - Description: Covers active user login, invalid password handling, unknown user handling, inactive user rejection, locked user rejection, and RBAC-compatible auth context creation.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-005 / Auth middleware
  - Description: Rejects unauthenticated requests and populates request auth through the auth service.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-006 / RBAC deny-by-default
  - Description: Verifies default deny behavior, admin permission grants, and warehouse scope requirements.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-007 / Client auth provider
  - Description: Covers startup session restore, loading state, unauthorized restore clearing, login, and logout.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-008 / Protected client routes
  - Description: Redirects unauthenticated users and renders protected content for authenticated users.
  - Priority: High
  - Status: Passed

- [ ] TC-AUTH-009 / Login page UX
  - Description: Verifies accessible fields, loading state, submitted credentials, and login failure alert rendering.
  - Priority: Medium
  - Status: Passed

### IDM-01 Production Import and Webhook Verification

- [ ] TC-IDM01-001 / Valid production import
  - Description: Imports valid production serials and writes production events.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM01-002 / Partial row rejection
  - Description: Rejects unknown products while processing valid rows.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM01-003 / Idempotent import batches
  - Description: Treats duplicate and concurrently processed batches as idempotent no-ops.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM01-004 / Transaction rollback on event failure
  - Description: Rolls back imported serial work and marks the batch failed when event append fails.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM01-005 / Import route authorization
  - Description: Denies import without auth and runs validation through injected services for authorized users.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM01-006 / Webhook signature verification
  - Description: Covers development-mode unsigned requests, valid HMAC signatures, missing headers, malformed signatures, wrong-length signatures, incorrect signatures, and tampered bodies.
  - Priority: High
  - Status: Passed

### IDM-02 GRN

- [ ] TC-IDM02-001 / Matched serial receipt
  - Description: Receives a matched serial and appends a GRN event.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM02-002 / Excess serial detection
  - Description: Flags excess serials during GRN scanning.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM02-003 / Wrong destination serial
  - Description: Flags serials expected for another destination as wrong serials.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM02-004 / Duplicate scan blocking
  - Description: Prevents duplicate scans from being accepted.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM02-005 / Short receipt exceptions
  - Description: Creates short exceptions for missing expected serials on GRN completion.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM02-006 / GRN frontend workflow
  - Description: Covers session creation, matched scan result, completion, rejected scan alert code, API scan errors, and create errors.
  - Priority: High
  - Status: Passed

### IDM-03 Battery Pre-Bill

- [ ] TC-IDM03-001 / Valid battery commit
  - Description: Commits a valid battery serial to an invoice line.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM03-002 / Product validation
  - Description: Rejects non-battery invoice lines and mismatched serial products.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM03-003 / Duplicate and dispatched serial protection
  - Description: Rejects already committed serials and already dispatched serials.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM03-004 / Battery route authorization and validation
  - Description: Covers successful commit, invalid commit, out-of-scope warehouse, missing fields, status lookup success, status lookup scope denial, and invalid invoice IDs.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM03-005 / Battery frontend workflow
  - Description: Covers scan session commit, status count rendering, API alert messages, network failure scan history, status fetch failure, and missing quantity fallback.
  - Priority: Medium
  - Status: Passed

### IDM-04 SRN and Condition Tags

- [ ] TC-IDM04-001 / Dispatched serial return
  - Description: Returns a dispatched serial to stock and appends an SRN event.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM04-002 / Original dispatch requirement
  - Description: Rejects returns where the original dispatch is missing.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM04-003 / Duplicate return blocking
  - Description: Prevents duplicate SRN returns.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM04-004 / Condition tag rules
  - Description: Exposes default tags, validates default/custom tag lists, rejects invalid tags, and preserves case-sensitive matching.
  - Priority: Medium
  - Status: Passed

- [ ] TC-IDM04-005 / SRN frontend workflow
  - Description: Covers SRN creation, condition tag result display, sending selected tag with scans, invalid scan alerts, and create errors.
  - Priority: Medium
  - Status: Passed

### IDM-05 Dispatch

- [ ] TC-IDM05-001 / Dispatch start scope
  - Description: Starts dispatches for invoices in caller warehouse, including string warehouse ID handling.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM05-002 / Missing or wrong warehouse invoice
  - Description: Marks missing or wrong-warehouse invoices as not found.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM05-003 / Valid dispatch scan
  - Description: Accepts a valid scan, dispatches the serial, and writes a customer dispatch event.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM05-004 / Mismatch and duplicate protections
  - Description: Rejects product-invoice mismatches, duplicate scans, and concurrent dispatched serial conflicts without unsafe event writes.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM05-005 / Completion guard
  - Description: Blocks completion when invoice lines are not fully scanned.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM05-006 / Dispatch routes
  - Description: Covers unauthenticated start denial, out-of-scope start denial, authorized start, unknown invoice 404, out-of-scope scan denial, string warehouse ID scan allowance, and out-of-scope completion denial.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM05-007 / Dispatch frontend workflow
  - Description: Covers dispatch creation, invoice line context requirement, valid scan result, completion state, and invalid alert rule code.
  - Priority: Medium
  - Status: Passed

### IDM-06 Serial Validation

- [ ] TC-IDM06-001 / Valid in-stock serial
  - Description: Allows a valid in-stock serial in the caller warehouse.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM06-002 / Exception-backed validation alerts
  - Description: Persists NOT_FOUND, WRONG_WAREHOUSE, and ALREADY_DISPATCHED alerts.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM06-003 / SRN validation context
  - Description: Allows dispatched serials when validating for SRN return context.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM06-004 / Client validation API
  - Description: Confirms validation API module posts serial and context.
  - Priority: Medium
  - Status: Passed

### IDM-07 Fulfilment Status

- [ ] TC-IDM07-001 / Fulfilment status states
  - Description: Returns PENDING, IN_PROGRESS, and DISPATCHED according to scanned quantities.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM07-002 / Incomplete completion guard
  - Description: Keeps incomplete completion blocked unless business rules explicitly allow it.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM07-003 / Fulfilment route scope
  - Description: Denies invoice status outside caller warehouse scope and allows in-scope access.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM07-004 / Fulfilment frontend workflow
  - Description: Covers search form, success rendering, missing quantity fallback, 404 error rendering, and missing committed quantity safety.
  - Priority: Medium
  - Status: Passed

### IDM-08 Ageing and Reconciliation

- [ ] TC-IDM08-001 / Ageing bucket assignment
  - Description: Assigns serials to configurable ageing buckets.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM08-002 / Missing receipt date handling
  - Description: Reports missing `received_at` as a data quality issue.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM08-003 / Ageing report service
  - Description: Summarizes bucket totals and exposes missing receipt dates in report output.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM08-004 / Ageing route scope
  - Description: Denies unauthenticated and out-of-scope ageing report requests and returns reports for authorized warehouse scope.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM08-005 / Reconciliation service delegation
  - Description: Delegates reconciliation queries with warehouse and product scope and propagates repository errors.
  - Priority: Medium
  - Status: Passed

- [ ] TC-IDM08-006 / Ageing frontend workflow
  - Description: Covers warehouse prompt, bucket load, zero-bucket empty states, warning banner, retryable backend failure, and null summary safety.
  - Priority: Medium
  - Status: Passed

- [ ] TC-IDM08-TODO-001 / Final ageing bucket definitions
  - Description: Pending confirmation of final bucket definitions and export shape after OI-8 closes.
  - Priority: Medium
  - Status: Skipped

- [ ] TC-IDM08-TODO-002 / SAP ageing-feed retry behavior
  - Description: Pending outbound transport authorization.
  - Priority: Medium
  - Status: Skipped

### IDM-09 Serial History

- [ ] TC-IDM09-001 / Chronological serial timeline
  - Description: Returns serial events and exceptions in chronological order.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM09-002 / Unknown serial handling
  - Description: Returns not found for unknown serials.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM09-003 / Correction-ready exception fields
  - Description: Exposes exception fields needed for correction workflows in timeline output.
  - Priority: Medium
  - Status: Passed

- [ ] TC-IDM09-004 / Serial history route scope
  - Description: Denies history outside caller warehouse scope and allows in-scope access.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM09-005 / Serial history frontend workflow
  - Description: Covers search form, timeline render, missing timeline safety, backend error render, empty input disablement, and input trimming.
  - Priority: Medium
  - Status: Passed

### IDM-10 Exceptions and Corrections

- [ ] TC-IDM10-001 / Correct open exception
  - Description: Corrects an OPEN exception and appends a CORRECTION event.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM10-002 / Correction reason validation
  - Description: Rejects empty or missing correction reasons.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM10-003 / Resolved exception protection
  - Description: Rejects correction of already corrected or dismissed exceptions.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM10-004 / Non-existent and concurrent correction
  - Description: Rejects unknown exceptions and returns conflict for concurrent correction attempts.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM10-005 / Serial event append edge cases
  - Description: Skips serial event append when exception has no serial or the serial row is missing.
  - Priority: Medium
  - Status: Passed

- [ ] TC-IDM10-006 / Exception listing and lookup
  - Description: Covers default pagination, filters, page size cap, single exception lookup, and unknown exception null response.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM10-007 / Correction route RBAC and scope
  - Description: Denies warehouse operators and unauthenticated users, allows admin and in-scope supervisor, and denies out-of-scope supervisor.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM10-008 / Exception route listing and details
  - Description: Covers supervisor scoped listing, admin unfiltered listing, unauthenticated denial, detail access rules, null warehouse handling, 404, and invalid ID.
  - Priority: High
  - Status: Passed

- [ ] TC-IDM10-009 / Exceptions frontend workflow
  - Description: Covers list rows, empty state, error survival, row/keyboard detail open, detail fetch error, correction submit, blank reason guard, and 409 conflict message.
  - Priority: Medium
  - Status: Passed

### Lookup and Warehouse Scope

- [ ] TC-LOOKUP-001 / Lookup service warehouse scope
  - Description: Covers admin and non-admin requested/default warehouse scope behavior and denial of unauthorized warehouse requests.
  - Priority: High
  - Status: Passed

- [ ] TC-LOOKUP-002 / Lookup repository delegation
  - Description: Confirms invoice and warehouse searches delegate to repositories with expected inputs.
  - Priority: Medium
  - Status: Passed

- [ ] TC-LOOKUP-003 / Lookup routes
  - Description: Lists scoped invoices, denies out-of-scope invoice lookup, and lists scoped SAP dispatch documents.
  - Priority: High
  - Status: Passed

### Client API Layer

- [ ] TC-API-001 / HTTP response normalization
  - Description: Handles 2xx bodies, empty responses, nested API errors, string errors, and non-JSON failure bodies.
  - Priority: High
  - Status: Passed

- [ ] TC-API-002 / Timeout, abort, and retry behavior
  - Description: Covers internal timeout, external abort, network errors, GET retry on 5xx, no retry on 4xx, retry exhaustion, and no POST retry.
  - Priority: High
  - Status: Passed

- [ ] TC-API-003 / Credentialed request safety
  - Description: Prevents caller-controlled auth headers, uses cookies, emits auth-expired event on 401, and sends correct GET/POST methods.
  - Priority: High
  - Status: Passed

- [ ] TC-API-004 / Auth API client
  - Description: Covers login, logout, and current-user request helpers.
  - Priority: High
  - Status: Passed

- [ ] TC-API-005 / IDM module clients
  - Description: Covers ageing, battery, dispatch, exceptions, fulfilment, GRN, serial history, import, lookups, SRN, and validation API paths and payloads.
  - Priority: High
  - Status: Passed

- [ ] TC-API-006 / Import monitor client
  - Description: Covers query params, empty argument handling, batch fetch, production import, and ageing summary fetch.
  - Priority: Medium
  - Status: Passed

### Frontend App Shell, Auth UI, Navigation

- [ ] TC-FE-SHELL-001 / Authenticated app shell
  - Description: Renders application shell and navigation for authenticated users.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-SHELL-002 / Sidebar branding and navigation
  - Description: Renders Microtek IDM brand, Microtek logo, section headers, operation links, monitoring links, admin link, user info, and closed overlay behavior.
  - Priority: Medium
  - Status: Passed

- [ ] TC-FE-SHELL-003 / Notification badge behavior
  - Description: Hides notification dot by default, does not treat open exceptions as notifications, and shows the dot only for explicit notification counts.
  - Priority: Medium
  - Status: Passed

- [ ] TC-FE-SHELL-004 / Route error fallback
  - Description: Renders route response errors and generic unexpected route failures.
  - Priority: Medium
  - Status: Passed

- [ ] TC-FE-SHELL-005 / Error boundary recovery
  - Description: Renders fallback UI, logs errors, and supports retry reset.
  - Priority: Medium
  - Status: Passed

### Shared Frontend Components and Charts

- [ ] TC-FE-COMP-001 / Data table rendering
  - Description: Covers headers, rows, status badges, loading skeleton, empty state, error state, sorting, and reverse sorting.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-COMP-002 / Pagination
  - Description: Covers one-page hidden state, page buttons, active page, disabled previous/next, direct page change, and previous/next change callbacks.
  - Priority: Medium
  - Status: Passed

- [ ] TC-FE-COMP-003 / KPI card
  - Description: Renders labels, values, units, trend indicators, loading skeletons, and formatted numeric values.
  - Priority: Medium
  - Status: Passed

- [ ] TC-FE-COMP-004 / Bar chart
  - Description: Covers isolated viewport, empty state, bounded single/multiple bar heights, large value scaling, and tooltip overflow visibility.
  - Priority: Medium
  - Status: Passed

### Scanner Hooks and Scan UI

- [ ] TC-SCAN-001 / Scan input
  - Description: Covers label rendering, Enter submit with trimming, disabled suppression, empty input suppression, hint text, and change handling.
  - Priority: High
  - Status: Passed

- [ ] TC-SCAN-002 / Scan camera
  - Description: Renders camera controls/formats and handles unsupported browser and permission denied states.
  - Priority: Medium
  - Status: Passed

- [ ] TC-SCAN-003 / Scan session hook
  - Description: Normalizes serials, stores successful scans, shows success feedback, rejects duplicates, suppresses repeat duplicate warnings, and blocks submission while paused.
  - Priority: High
  - Status: Passed

- [ ] TC-SCAN-004 / Scanner hook
  - Description: Covers scanner suffix trimming, serial normalization, empty values, support detection, hardware submit, fallback decoder, decoded fallback values, permission denied errors, secure-context diagnostics, and cleanup.
  - Priority: High
  - Status: Passed

### Frontend Operations Workflows

- [ ] TC-FE-OPS-001 / GRN page
  - Description: Covers session creation, matched scan, completion, rejected alert codes, API scan errors, and create errors.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-OPS-002 / Dispatch page
  - Description: Covers dispatch creation, invoice line context requirement, valid scan, completion, and invalid scan alert codes.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-OPS-003 / SRN page
  - Description: Covers SRN creation, condition tag result display, selected tag submission, invalid alert codes, and create errors.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-OPS-004 / Battery page
  - Description: Covers serial commit through scan session, status count, API alert errors, network failure scan history, status fetch failure, and missing quantity fallback.
  - Priority: High
  - Status: Passed

### Frontend Monitoring Workflows

- [ ] TC-FE-MON-001 / Dashboard page
  - Description: Covers KPI labels, ageing buckets, isolated chart viewport, empty chart state, empty activity state, full endpoint failure, partial data, chart error state, and KPI retry.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-MON-002 / Ageing page
  - Description: Covers warehouse prompt, bucket load, zero-bucket display, missing receipt date warning, backend failure retry, and null summary safety.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-MON-003 / Fulfilment page
  - Description: Covers initial search, success status, missing required/scanned quantity fallback, 404 error, and missing committed quantity safety.
  - Priority: Medium
  - Status: Passed

- [ ] TC-FE-MON-004 / Serial history page
  - Description: Covers search, timeline render, missing timeline safety, backend error, disabled empty search, and trimmed submit.
  - Priority: Medium
  - Status: Passed

- [ ] TC-FE-MON-005 / Exceptions page
  - Description: Covers rows, pagination summary, empty state, 500 response survival, row/keyboard detail access, detail error, correction submit, blank reason guard, and conflict message.
  - Priority: High
  - Status: Passed

- [ ] TC-FE-MON-006 / Import monitor page
  - Description: Covers page header, import form submission, and result display.
  - Priority: Medium
  - Status: Passed

### CSV Utilities and Export Safety

- [ ] TC-CSV-001 / Server CSV cell sanitization
  - Description: Neutralizes spreadsheet command injection, quotes comma/newline values, doubles embedded quotes, preserves safe strings, and coerces null/undefined/numbers.
  - Priority: High
  - Status: Passed

- [ ] TC-CSV-002 / Client CSV sanitization
  - Description: Preserves safe values, converts null/undefined to empty string, converts numbers to strings, and prefixes risky negative values.
  - Priority: High
  - Status: Passed

- [ ] TC-CSV-003 / Client CSV parse/export
  - Description: Parses headers, rows, row numbers, and escapes cells containing commas and quotes.
  - Priority: Medium
  - Status: Passed

## Missing Coverage Analysis

- **Critical: Metrics endpoint production restriction is not directly covered.** The project notes `/api/metrics` must be restricted before production, but there is no clear test asserting access control for metrics.

- **Critical: Warehouse scope enforcement is well covered in core flows, but not every route has an explicit negative scope test.** Coverage exists for GRN, SRN, dispatch, fulfilment, ageing, history, lookups, battery, and exceptions. Any new routes should add matching out-of-scope tests.

- **High: Frontend RBAC visibility is not deeply tested.** Server RBAC is covered, but tests do not appear to assert role-based hiding/disabling of frontend navigation or page actions.

- **High: Real browser scanner behavior is simulated, not end-to-end verified.** Scanner hook and camera fallback paths are covered, but hardware scanner certification, camera device variance, and mobile browser behavior remain outside automated coverage.

- **High: Offline or reconnect behavior is not covered.** Offline sync is an open production decision, and no tests cover queued scans, retry after reconnect, or duplicate prevention across offline boundaries.

- **High: SAP transport behavior is intentionally not covered.** OI-7 blocks real SAP adapter work. Import contract tests exist, but no outbound/inbound SAP adapter transport tests should be expected until the contract is resolved.

- **Medium: Accessibility coverage is partial.** Login, route fallback, scan controls, and table interactions have some accessible assertions, but there is no automated accessibility audit for color contrast, focus order, or keyboard-only completion of full workflows.

- **Medium: Visual regression coverage is absent.** Recent brand, tooltip, and notification UI issues are unit-tested where possible, but there are no screenshot or Playwright visual regression checks for dense dashboard layout, mobile navigation, or chart tooltip positioning in a real browser.

- **Medium: CSV export safety is covered at utility level, but not every export page has an explicit assertion that exported fields pass through sanitization.** Utility coverage is strong; workflow-level export coverage should be expanded for ageing, exceptions, GRN, and reviewed exception exports.

- **Medium: Pagination and sorting are tested in shared components, but not exhaustively in every server-backed table page.** Exceptions page has pagination summary coverage; other data-heavy pages rely on component-level tests.

- **Low: Dark theme and Microtek brand styling are not covered by visual assertions.** Functional tests check logo and notification behavior, but not brand color mapping, sidebar contrast, or dark-mode regressions.

- **Low: Error logging and observability are lightly covered.** Error boundary logging is tested, but route-level observability helpers and structured server logs are not deeply asserted.

## Audit Notes

- Current automated coverage is strong for server-side warehouse controls: RBAC, warehouse scope, validation alerts, exception correction, dispatch concurrency, import idempotency, and CSV injection safety.
- The highest remaining risk is browser-real UI behavior: scanner hardware, responsive layout, tooltip placement, and visual regressions.
- The 2 skipped/todo tests are intentional ageing/SAP-related placeholders tied to unresolved business decisions and external integration authorization.
