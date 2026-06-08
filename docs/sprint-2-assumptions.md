# Sprint 2 Assumptions

Last updated: 2026-06-06

## Confirmed implementation scope

- IDM-05 Warehouse Dispatch with Serial Scan.
- IDM-07 Order Fulfilment Status Marking.
- V003 PostgreSQL migration for `invoice`, `invoice_line`, `dispatch`, and `dispatch_scan`.
- No SAP outbound transport implementation.

## OI-4 partial-dispatch assumptions

- OI-4 is not permanently resolved by this implementation.
- The database supports only `PENDING`, `IN_PROGRESS`, and `DISPATCHED` for invoice and dispatch status.
- `PARTIAL` is not encoded in V003 database constraints.
- Some-but-not-all scanned invoice quantity is represented as `IN_PROGRESS`.
- Dispatch completion is blocked unless all required invoice quantities are scanned.
- Any future `PARTIAL` behavior must be added through the business-rule layer, not database CHECK constraints or hardcoded repository behavior.
- The current business-rule layer is `server/src/idm07/fulfilmentStatusService.js`.

## SAP outbound compatibility

- V003 stores `sap_outbound_batch_id` on `invoice` and `dispatch` for future outbound confirmed-serial processing.
- Sprint 2 does not create an outbound transport, queue sender, SAP adapter, or posting mechanism.
- Future outbound processing should use `integration_batch` idempotency and replay semantics from the existing architecture.

## Security posture

- Dispatch APIs use the existing request auth context and default-deny RBAC scaffold.
- Dispatch start checks caller warehouse scope through `warehouseId`.
- Dispatch scan reuses IDM-06 validation and exception persistence.
- Dispatch acceptance writes `CUSTOMER_DISPATCH` to the append-only `serial_event` ledger.
- Repository queries use parameterized `pg` calls.
