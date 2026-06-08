# Platform Hardening Report

Last updated: 2026-06-06

## Scope reviewed

- IDM-01 production import.
- IDM-05 dispatch scan.
- IDM-06 validation and exception creation.
- IDM-07 fulfilment status marking.
- IDM-08 ageing/reporting.
- V001 through V004 migrations, with hardening delivered in V005.

## Issues discovered

- Production import wrote serial rows and serial events outside a transaction, allowing partial import state if event insertion failed.
- Duplicate import races could hit the `integration_batch` unique key instead of resolving idempotently.
- Dispatch scan wrote scan rows, serial status, serial events, dispatch status, and invoice status across separate awaits.
- Dispatch scan and completion routes authorized role permission but did not resolve `dispatch_id` to a stored warehouse before write access.
- Concurrent dispatch scans could pass validation before another request changed the serial status.
- Duplicate dispatch scans could crash after a null insert result instead of returning a controlled validation-style failure.
- Dispatch line scan counts needed an index for repeated quantity checks.
- Serial event and exception context lookup paths needed indexes for audit/report workflows.

## Fixes implemented

- Added repository-level `withTransaction` support using PostgreSQL `BEGIN` / `COMMIT` / `ROLLBACK`.
- Wrapped production serial import row/event writes in a transaction and mark failed batches after rollback.
- Made integration batch creation race-tolerant with `ON CONFLICT ... DO NOTHING`, returning the existing batch.
- Wrapped accepted dispatch scan work in a transaction.
- Added dispatch row locking with `SELECT ... FOR UPDATE` during scan and completion.
- Added conditional serial status update from `IN_STOCK` to `DISPATCHED` to catch races.
- Made duplicate dispatch scan insertion idempotent with `ON CONFLICT ... DO NOTHING`.
- Added server-side dispatch warehouse authorization before scan and complete route handlers.
- Persisted dispatch race/duplicate failures as `ALREADY_DISPATCHED` exceptions where the exception repository is available.

## Schema changes

- `V005__platform_hardening.sql`
  - `ux_dispatch_invoice_once` on `dispatch(invoice_id)`.
  - `ux_dispatch_scan_serial_once` on `dispatch_scan(serial_id)`.
  - `ix_dispatch_scan_line_count` on `dispatch_scan(dispatch_id, invoice_line_id)`.
  - `ix_serial_event_reference` on `serial_event(reference_type, reference_id)`.
  - `ix_exception_context` on `exception_log(context_type, context_id)`.
- `U005__platform_hardening.sql` drops those indexes for pre-go-live rollback validation.

## Tests added

- Import rollback on serial event failure.
- Import duplicate race where `createPending` returns an already processed batch.
- Dispatch duplicate scan handling without event/status duplication.
- Dispatch concurrent status update race.
- Dispatch scan and complete authorization by stored dispatch warehouse.
- V005/U005 migration coverage for hardening indexes.

## Remaining risks

- Tests still use repository/service doubles rather than a live PostgreSQL concurrency harness.
- No load test exists yet because OI-5 and OI-6 remain open.
- Materialized view refresh scheduling for IDM-08 remains pending.
- Pilot authentication/session controls now exist. Final production auth hierarchy, MFA/SSO, and user administration remain pending OI-9.
- SAP transport failure/replay testing remains limited until OI-7 is finalized.
