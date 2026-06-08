# Sprint 3 Assumptions

Last updated: 2026-06-06

## Confirmed implementation scope

- IDM-08 Inventory Ageing Report.
- Ageing/reporting database structures in V004.
- Opening-stock reconciliation foundations for variance reporting.
- Pilot-readiness reporting support.
- No SAP ageing-feed transport.
- No mobile scanning flows.

## OI-8 ageing bucket assumptions

- OI-8 is not permanently resolved by this implementation.
- Ageing buckets are configured in the business-rule layer, not in database constraints or persisted schema.
- The current default bucket set is temporary: `0-30`, `31-60`, `61-90`, and `91+`.
- Bucket configuration can be replaced by passing another bucket set to `createAgeingBucketService`.
- `serial_master.received_at` is the source field for age calculations.
- In-stock serials with missing `received_at` are reported as a data-quality issue under `MISSING_RECEIVED_AT`, not silently bucketed.

## OI-10 opening-stock assumptions

- OI-10 is not resolved by this implementation.
- V004 creates structures to store opening-stock reconciliation runs and product-level variance rows.
- No variance threshold, pass/fail rule, approval workflow, or cutover business decision is encoded.
- The reconciliation route is read-only and returns stored variance data.
- Known opening discrepancies should later be logged as exceptions, but that workflow is not implemented in Sprint 3.

## Reporting isolation

- Ageing reports read from `ageing_serial_snapshot`, a report-side materialized view over `serial_master`.
- Validation hot-path services do not depend on ageing report services.
- Refresh scheduling for `ageing_serial_snapshot` is not implemented yet.

## Security posture

- Ageing and reconciliation APIs require explicit auth headers and RBAC permissions.
- Ageing and reconciliation APIs enforce warehouse scope through query filters.
- Repositories use parameterized `pg` queries.
- API responses return report-level fields and avoid stack traces or internal SQL errors.
