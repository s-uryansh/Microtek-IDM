# Sprint 4 Business Module Assumptions

Last updated: 2026-06-06

## Historical implementation scope

- IDM-02 Scan-based GRN.
- IDM-04 Customer Returns / SRN.
- IDM-09 Serial Transaction History.
- V006 PostgreSQL migration for sender dispatch documents, GRN, SRN, and history lookup support.
- IDM-03 battery pre-billing was implemented after this original scope via V007 and related backend/frontend code.
- IDM-10 exception correction portal was implemented after this original scope with backend/frontend code.
- No IDM-11 DMS/SFA integration.
- No SAP outbound transport.
- No mobile UI.

## OI-1 scanning hardware assumptions

- Backend APIs accept plain serial strings and do not assume barcode vs. QR or handheld vs. phone scanning.
- Device-specific metadata and scanner UX are deferred until hardware is finalized.

## OI-2 connectivity assumptions

- Offline mode is not implemented.
- GRN and SRN scan endpoints are idempotent enough for later sync/replay work, but no local queue, signed offline payload, or sync API is included.

## OI-3 SRN condition tag assumptions

- OI-3 remains unresolved.
- SRN condition tags are validated by a configurable business-rule layer.
- Current temporary allowed tags are `SALEABLE`, `DEFECTIVE`, and `REPAIR`.
- Final taxonomy can replace the configured tags without schema changes because `srn_scan.condition_tag` stores the selected tag as data.

## OI-5/OI-6 load assumptions

- V006 adds indexes for GRN/SRN hot-path lookups.
- No formal load target is encoded because concurrent users and daily scan volume remain open.
- Production load validation still requires a live PostgreSQL concurrency harness and OI-5/OI-6 decisions.

## Security posture

- GRN and SRN APIs require explicit auth headers and RBAC permissions.
- Object-level warehouse authorization resolves stored GRN/SRN warehouse IDs server-side.
- State-changing scan flows use repository transactions.
- Repositories use parameterized `pg` queries.
- Accepted GRN/SRN scans append `serial_event` rows; exceptions persist to `exception_log`.
