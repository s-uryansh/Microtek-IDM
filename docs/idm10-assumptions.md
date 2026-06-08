# IDM-10 Exception Correction Portal — Sprint Assumptions

## Current Scope

- Backend API for listing, viewing, and correcting exceptions is implemented.
- Web portal UI is implemented in `client/src/features/exceptions/ExceptionsPage.jsx`.
- No SAP outbound integration for corrections exists.

## Warehouse Scope

- Exceptions with GRN context resolve warehouse from `grn.receiving_warehouse_id`.
- Exceptions with DISPATCH context resolve warehouse from `dispatch.warehouse_id`.
- Exceptions with SRN context resolve warehouse from `srn.receiving_warehouse_id`.
- Exceptions with other context types (FOUNDATION, IMPORT, BATTERY) have no resolvable warehouse.
- When listing exceptions, warehouse filtering applies to resolvable exceptions only.
- Exceptions without a resolvable warehouse are visible only to admin.
- Supervisor and warehouse_operator see only exceptions whose resolved warehouse is in their scope.

## Audit

- `raised_at`, `raised_by`, and `rule_code` on exception_log are immutable.
- Correction appends a `CORRECTION` serial_event with `referenceType: "EXCEPTION"` and `referenceId` pointing to the exception.
- If the exception has `serial_no = null` (e.g., MALFORMED_SERIAL), the serial_event is skipped.
- If `serial_no` exists but the serial_master row is gone (edge case), the serial_event is skipped.

## Concurrency

- The `correctException` repository method uses a conditional UPDATE (`WHERE status = 'OPEN'`).
- Wrapped in `withTransaction` for atomicity.
- If the UPDATE returns zero rows, the caller receives 409 Conflict.

## Security

- `exception:read` is granted to admin, supervisor, and warehouse_operator.
- `exception:correct` is granted to admin and supervisor only.
- Warehouse-scoped authorization is enforced for single-exception retrieval via a route middleware check.

## Open Items

- No open items block the implemented IDM-10 web/API flow.
- Final production role hierarchy remains governed by OI-9.

## Migration

- No new database migration required.
- Existing V002 and V006 migrations provide all necessary columns and constraints.
- `serial_event.event_type` CHECK includes `'CORRECTION'` (from V002).
- `exception_log.status` CHECK includes `'CORRECTED'` (from V002).
