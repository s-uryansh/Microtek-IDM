# Microtek IDM Implementation Reference

Last updated: 2026-06-07

This is the primary developer reference for the current Microtek IDM implementation.

## System Architecture

Microtek IDM is an npm workspace with an Express/PostgreSQL backend and a React/Vite frontend. Backend routes delegate to services. Services enforce business rules and call repositories. Repositories are the SQL boundary and use parameterized `pg` queries. Frontend feature pages call API modules through a shared credentialed API client.

## Authentication

Purpose: authenticate web users and provide RBAC-compatible request context.

Endpoints:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Login request:

```json
{ "username": "admin", "password": "admin123" }
```

Login response:

```json
{
  "user": {
    "userId": "1",
    "username": "admin",
    "role": "admin",
    "warehouseIds": [1, 2, 3]
  }
}
```

Session lifecycle:

1. Password is checked with bcrypt.
2. Server creates an `auth_session` row.
3. Server signs a JWT containing session ID, subject, role, and warehouse IDs.
4. JWT is set in `idm_auth` HTTP-only cookie.
5. Cookie expiry matches backend session expiry.
6. `/auth/me` verifies JWT, checks session row, rejects expired/revoked sessions, reloads active user, and returns public user.
7. Logout revokes the server session and clears the cookie.

Security notes:

- Tokens are not stored in frontend storage.
- API client sends `credentials: "include"`.
- API 401 dispatches an auth-expired event so the provider clears user state.
- Production rejects the default development auth secret.

## RBAC

RBAC is deny-by-default in `server/src/security/rbacPolicy.js`.

Roles:

- `admin`
- `supervisor`
- `warehouse_operator`

Permissions:

- `foundation:read`
- `integration:import`
- `serial:validate`
- `dispatch:write`
- `grn:write`
- `srn:write`
- `fulfilment:read`
- `ageing:read`
- `reconciliation:read`
- `serial-history:read`
- `exception:read`
- `exception:correct`
- `battery:write`
- `battery:read`

Warehouse scope is checked by route middleware for direct warehouse IDs and by services for object-level operations such as GRN, SRN, dispatch, and exceptions.

## Scanner Workflow

Scanner code is shared by GRN, Dispatch, SRN, and Battery.

Components and hooks:

- `useScanner`: camera lifecycle, native `BarcodeDetector`, ZXing fallback, hardware scanner submission, cleanup.
- `useScanSession`: duplicate detection, pause/resume, pending/success/error/warning state, scan history.
- `ScanCamera`: camera preview and camera-state UI.
- `ScanScanner`: keyboard-wedge/manual scanner input.
- `ScanSession`: workflow orchestrator.

Decode priority:

1. Native `BarcodeDetector`
2. `@zxing/browser`
3. Hardware/manual scanner input

Supported targets: QR, Code128, Code39, EAN13, UPC-A, UPC-E, and serial barcodes supported by the active decoder.

## Dashboard Architecture

Route: `/dashboard`.

The dashboard uses live backend APIs for ageing and exception summaries. It is a web dashboard over operational data, not a separate backend module. Current limitation: ageing widgets use fixed warehouse ID `3`.

## API Architecture

The client API layer lives in `client/src/api/`.

- `client.js`: fetch wrapper, credentials, JSON, timeout, abort, GET retry, 401 auth-expired event.
- `errors.js`: `ApiError`, `TimeoutError`, `AbortError`.
- `modules/*.js`: endpoint-specific request functions.

The backend API is mounted under `/api`. Module routes live in `server/src/idm*/`.

## Database Migration History

- `V001__foundation_reference_rbac.sql`: warehouses, products, roles, permissions, users, warehouse scope.
- `V002__serial_core_integration.sql`: integration batches, serial master, serial events, exception log.
- `V003__invoice_dispatch.sql`: invoices, invoice lines, dispatches, dispatch scans.
- `V004__ageing_reconciliation.sql`: ageing materialized view and opening-stock reconciliation tables.
- `V005__platform_hardening.sql`: idempotency, dispatch concurrency, and lookup indexes.
- `V006__grn_srn_history.sql`: SAP dispatch docs/lines, GRN, GRN scans, SRN, SRN scans, history indexes.
- `V007__battery_pre_billing.sql`: battery pre-billing table and PRE_BILLING event support.
- `V008__authentication.sql`: password hashes, login counters, auth sessions, development admin bootstrap.

## IDM-01 Production Import

Purpose: import production serials from an external source.

Business workflow:

1. External payload arrives with `externalRef`, `source`, and serial records.
2. Service creates or reuses an integration batch.
3. Valid product records create serials and serial events.
4. Unknown products or invalid rows are returned as rejections.
5. Duplicate batch references are idempotently ignored.

Endpoint:

- `POST /api/idm-01/import/production`

Request:

```json
{
  "externalRef": "SAP-PROD-001",
  "source": "SAP",
  "records": [
    {
      "serialNo": "SN-001",
      "productCode": "MTK-INVERTER-1KVA",
      "batchNo": "BATCH-01",
      "warehouseId": 3
    }
  ]
}
```

Response:

```json
{
  "status": "IMPORTED",
  "importedCount": 1,
  "rejectedCount": 0,
  "rejections": []
}
```

Validation rules: required external reference, source, serial number, known product, optional warehouse.

Permission: `integration:import`.

Database entities: `integration_batch`, `serial_master`, `serial_event`, `product`, `warehouse`.

Events generated: production/import serial events.

Exception cases: duplicate batch, duplicate serial, unknown product, malformed payload.

Frontend screen: Import Monitor.

Manual testing: use section 5 of `docs/manual-testing-guide.md`.

## IDM-02 GRN

Purpose: receive and verify incoming stock against SAP dispatch documents.

Business workflow:

1. Operator creates GRN from SAP dispatch document ID and receiving warehouse ID.
2. Operator scans received serials.
3. System classifies scans as matched, excess, wrong serial, duplicate, or rejected.
4. Completing GRN creates short exceptions for expected but unscanned serials.

Endpoints:

- `POST /api/idm-02/grns`
- `GET /api/idm-02/grns/:grnId`
- `POST /api/idm-02/grns/:grnId/scans`
- `POST /api/idm-02/grns/:grnId/complete`

Create request:

```json
{ "sapDispatchDocId": 10, "warehouseId": 3 }
```

Scan request:

```json
{ "serialNo": "MTK-INTRANSIT-0001" }
```

Scan response:

```json
{
  "valid": true,
  "matchStatus": "MATCHED",
  "serial": { "serialId": 1, "serialNo": "MTK-INTRANSIT-0001" }
}
```

Validation rules: GRN must exist, user must be warehouse-scoped, serial must be valid for receipt context, duplicate scans are rejected or warned.

Permission: `grn:write`.

Database entities: `sap_dispatch_doc`, `sap_dispatch_line`, `grn`, `grn_scan`, `serial_master`, `serial_event`, `exception_log`.

Events generated: GRN/receipt serial events and exception rows.

Exception cases: `SHORT`, `EXCESS`, `WRONG_SERIAL`, `DUPLICATE_SCAN`.

Frontend screen: GRN.

Manual testing: use section 11 of `docs/manual-testing-guide.md`.

## IDM-03 Battery Pre-Billing

Purpose: pre-commit battery serials to invoice lines before billing.

Business workflow:

1. Operator enters invoice line ID.
2. Operator scans battery serials.
3. System verifies battery product, invoice line product, in-stock state, and duplicate commit.
4. Valid serial is committed to `battery_pre_billing`.
5. Fulfilment status includes committed quantity.

Endpoints:

- `POST /api/idm-03/battery/commit`
- `GET /api/idm-03/battery/invoices/:invoiceId/status`

Commit request:

```json
{ "invoiceLineId": 20, "serialNo": "BAT-001" }
```

Commit response:

```json
{
  "valid": true,
  "status": "COMMITTED",
  "serial": { "serialId": 7, "serialNo": "BAT-001" }
}
```

Status response:

```json
{ "invoiceId": 30, "committedQuantity": 1 }
```

Validation rules: invoice line exists, product is battery product, serial is in stock, serial product matches invoice line, serial not already committed.

Permissions: `battery:write`, `battery:read`.

Database entities: `battery_pre_billing`, `invoice`, `invoice_line`, `serial_master`, `serial_event`.

Events generated: `PRE_BILLING`.

Exception cases: product mismatch, non-battery invoice line, not in stock, already committed.

Frontend screen: Battery.

Manual testing: use section 14 of `docs/manual-testing-guide.md`.

## IDM-04 SRN

Purpose: process customer return serials.

Business workflow:

1. Operator creates SRN for receiving warehouse.
2. Operator selects condition tag.
3. Operator scans returned serials.
4. System verifies original dispatch and duplicate return status.

Endpoints:

- `POST /api/idm-04/srns`
- `POST /api/idm-04/srns/:srnId/scans`

Create request:

```json
{ "warehouseId": 3 }
```

Scan request:

```json
{ "serialNo": "DEMO-SRN-0001", "conditionTag": "SALEABLE" }
```

Response:

```json
{ "valid": true, "conditionTag": "SALEABLE" }
```

Validation rules: SRN exists, warehouse scope is valid, condition tag is allowed, serial has original dispatch scan, serial not already returned.

Permission: `srn:write`.

Database entities: `srn`, `srn_scan`, `dispatch_scan`, `serial_master`, `serial_event`, `exception_log`.

Events generated: SRN/return serial events.

Exception cases: not originally dispatched, already returned, invalid condition tag.

Frontend screen: SRN.

Manual testing: use section 12 of `docs/manual-testing-guide.md`.

## IDM-05 Dispatch

Purpose: scan and dispatch invoice serials from warehouse stock.

Business workflow:

1. Operator creates dispatch from invoice ID and warehouse ID.
2. Operator enters invoice line ID.
3. Operator scans serials.
4. System validates warehouse, serial state, product match, duplicate scan, and invoice line.
5. Completion updates dispatch and invoice status.

Endpoints:

- `POST /api/idm-05/dispatches`
- `POST /api/idm-05/dispatches/:dispatchId/scans`
- `POST /api/idm-05/dispatches/:dispatchId/complete`

Create request:

```json
{ "invoiceId": 30, "warehouseId": 3 }
```

Scan request:

```json
{ "invoiceLineId": 20, "serialNo": "MTK-INV1K-0001" }
```

Scan response:

```json
{ "valid": true, "status": "ACCEPTED" }
```

Validation rules: dispatch exists, invoice line exists, warehouse scope is valid, serial is in stock at warehouse, product matches invoice line, duplicate scan blocked.

Permission: `dispatch:write`.

Database entities: `invoice`, `invoice_line`, `dispatch`, `dispatch_scan`, `serial_master`, `serial_event`, `exception_log`.

Events generated: dispatch serial events.

Exception cases: wrong warehouse, already dispatched, product mismatch, malformed serial, duplicate scan.

Frontend screen: Dispatch.

Manual testing: use section 7 of `docs/manual-testing-guide.md`.

## IDM-06 Serial Validation

Purpose: provide shared serial validation and exception logging.

Endpoint:

- `POST /api/idm-06/validate`

Request:

```json
{
  "serialNo": "MTK-INV1K-0001",
  "contextType": "FOUNDATION",
  "warehouseId": 3,
  "expectedProductId": 1
}
```

Response:

```json
{ "valid": true, "serial": { "serialNo": "MTK-INV1K-0001" } }
```

Validation rules: serial format, existence, warehouse, dispatch status, expected product.

Permission: `serial:validate`.

Database entities: `serial_master`, `exception_log`.

Events generated: exception rows for validation failures.

Exception cases: `MALFORMED_SERIAL`, `NOT_FOUND`, `WRONG_WAREHOUSE`, `ALREADY_DISPATCHED`, `PRODUCT_INVOICE_MISMATCH`.

Frontend screen: API module only; no standalone page.

Manual testing: use section 6 of `docs/manual-testing-guide.md`.

## IDM-07 Fulfilment Status

Purpose: summarize invoice fulfilment.

Endpoint:

- `GET /api/idm-07/orders/:invoiceId/status`

Response:

```json
{
  "invoiceId": 30,
  "status": "IN_PROGRESS",
  "requiredQuantity": 2,
  "scannedQuantity": 1,
  "committedQuantity": 1
}
```

Validation rules: invoice must exist and user must have fulfilment read permission.

Permission: `fulfilment:read`.

Database entities: `invoice`, `invoice_line`, `dispatch_scan`, `battery_pre_billing`.

Events generated: none.

Exception cases: missing invoice, unauthorized access.

Frontend screen: Fulfilment.

Manual testing: use section 8 of `docs/manual-testing-guide.md`.

## IDM-08 Ageing And Opening Stock Variance

Purpose: report inventory ageing and opening-stock reconciliation variance.

Endpoints:

- `GET /api/idm-08/ageing?warehouseId=3&productId=1`
- `GET /api/idm-08/reconciliation/opening-stock/variance?warehouseId=3&productId=1`

Ageing response:

```json
{
  "summary": [
    { "bucket": "0-30", "label": "0-30", "quantity": 10 }
  ],
  "dataQuality": { "missingReceivedAtCount": 0 }
}
```

Validation rules: warehouse/product filters must be valid when supplied; warehouse scope is enforced.

Permissions: `ageing:read`, `reconciliation:read`.

Database entities: `ageing_serial_snapshot`, `serial_master`, `opening_stock_reconciliation_run`, `opening_stock_reconciliation_line`.

Events generated: none.

Exception cases: missing receipt dates are reported in data-quality counts.

Frontend screens: Dashboard, Ageing.

Manual testing: use sections 9 and 10 of `docs/manual-testing-guide.md`.

## IDM-09 Serial History

Purpose: reconstruct a serial timeline from events and exceptions.

Endpoint:

- `GET /api/idm-09/serials/:serialNo/history`

Response:

```json
{
  "serialNo": "MTK-LIFECYCLE-0001",
  "timeline": [
    { "type": "EVENT", "eventType": "PRODUCTION_IMPORT", "occurredAt": "2026-06-07T00:00:00.000Z" }
  ]
}
```

Validation rules: serial number required.

Permission: `serial-history:read`.

Database entities: `serial_master`, `serial_event`, `exception_log`.

Events generated: none by read operation.

Exception cases: missing serial returns empty or not-found style response depending service path.

Frontend screen: Serial History.

Manual testing: use section 13 of `docs/manual-testing-guide.md`.

## IDM-10 Exception Correction

Purpose: list, inspect, and correct exceptions.

Endpoints:

- `GET /api/idm-10/exceptions`
- `GET /api/idm-10/exceptions/:exceptionId`
- `POST /api/idm-10/exceptions/:exceptionId/correct`

List filters:

```text
status=OPEN&contextType=GRN&page=1&pageSize=50
```

Correction request:

```json
{ "correctionReason": "Verified manually - serial is valid." }
```

Correction response:

```json
{
  "exceptionId": 10,
  "status": "CORRECTED",
  "correctionReason": "Verified manually - serial is valid."
}
```

Validation rules: exception exists, user can read/correct by role and warehouse scope, correction reason required, exception must be open.

Permissions: `exception:read`, `exception:correct`.

Database entities: `exception_log`, `serial_event`, `serial_master`.

Events generated: `CORRECTION` serial event when serial can be resolved.

Exception cases: not found, unauthorized warehouse, already corrected conflict, missing correction reason.

Frontend screen: Exception Portal.

Manual testing: use section 15 of `docs/manual-testing-guide.md`.

## Security Review Notes

Applied low-risk fixes:

- Auth cookie now persists until backend session expiry.
- Frontend clears auth state on API 401.
- CORS no longer reflects arbitrary origins; it uses configured `CORS_ORIGIN`.
- Camera scanner now distinguishes permission denied, unavailable, unsupported, and retry states.

Remaining recommendations:

- Add production MFA/SSO and user management.
- Add CSRF protection if cross-site deployment constraints change beyond `SameSite=Lax`.
- Add structured security audit logs and alerting.
- Certify scanner devices and mobile browsers during pilot.
- Implement offline queue only after backend idempotency and conflict contracts are defined.
