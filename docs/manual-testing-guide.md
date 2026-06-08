# Manual Testing Guide

Last updated: 2026-06-07

## 1. Prepare the database

Run migrations, then load development seed data:

```bash
npm run migrate --workspace server
npm run seed:dev
```

The seed runner refuses to run when `NODE_ENV=production` or when `DATABASE_URL` looks production-like.

To remove the demo data:

```bash
npm run seed:dev:teardown
```

## 2. Start the API

```bash
npm run dev:server
```

Base URL:

```text
http://localhost:4000
```

Authenticate first and store the HTTP-only cookie:

```bash
curl -i -c /tmp/microtek-idm.cookie \
  -H "Content-Type: application/json" \
  -X POST http://localhost:4000/api/auth/login \
  -d '{ "username": "admin", "password": "admin123" }'
```

Use the cookie jar on subsequent API calls:

```bash
curl -b /tmp/microtek-idm.cookie http://localhost:4000/api/auth/me
```

Confirm persistent cookie metadata:

```bash
curl -i -c /tmp/microtek-idm.cookie \
  -H "Content-Type: application/json" \
  -X POST http://localhost:4000/api/auth/login \
  -d '{ "username": "admin", "password": "admin123" }' | grep -i "set-cookie"
```

Expected: `idm_auth` includes `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Expires=`.

Development-only default credentials:

```text
username: admin
password: admin123
```

The password is stored only as a bcrypt hash. The default admin has all seeded warehouse scopes. Older examples below may still show explicit `x-user-*` headers for readability; for end-to-end auth testing, replace those auth headers with `-b /tmp/microtek-idm.cookie`.

## 2A. Start the web portal

```bash
npm run dev:client
```

Open:

```text
http://localhost:5173
```

Log in with the development account:

```text
username: admin
password: admin123
```

## 2B. Mobile web scanning checks

Use Chrome or another Chromium-based browser on Android/rugged devices for camera scanning. Camera access requires HTTPS or localhost. Hardware keyboard-wedge scanners can be tested in any supported browser by focusing the scan field once and scanning barcodes that send an Enter key suffix.

Recommended viewport checks in browser dev tools:

- 320px
- 360px
- 375px
- 390px
- 414px
- 768px

For GRN, Dispatch, SRN, and Battery pages:

1. Log in.
2. Open the workflow page.
3. Start or configure the workflow with seed IDs.
4. Confirm the scan session shows camera controls, hardware scanner input, pause/resume, scan count, and scan history.
5. For camera mode, tap `Start Camera`, allow camera permission, and scan a supported QR/barcode.
6. For hardware mode, focus `Scan Serial` once, scan repeatedly, and confirm Enter submits without touching the screen again.
7. Repeat the same serial and confirm duplicate warning feedback.
8. Confirm success, warning, and error states are visible and announced through live regions.

Scanner compatibility:

- Native `BarcodeDetector` is used when available.
- `@zxing/browser` fallback is used when native barcode detection is unavailable.
- Hardware keyboard-wedge scanning remains available without camera support.

Known web scanner limitations:

- Camera scanning depends on `MediaDevices`, browser camera permission, and HTTPS or localhost.
- Dispatch and Battery still require invoice line ID entry before scanning.
- Offline queue/sync is not implemented.
- No native mobile app exists.

## 3. Seeded demo data

Warehouses:

- `PLNT-01`
- `CW-01`
- `RW-01`
- `RW-02`
- `RW-03`

Products:

- `SKU-INV-1`
- `SKU-INV-2`
- `SKU-BAT-1`
- `SKU-BAT-2`

Useful serials:

- `DEMO-GRN-0001`: expected on `DEMO-DISP-CW-01`.
- `DEMO-GRN-0002`: expected on `DEMO-DISP-CW-01`, useful for SHORT if left unscanned.
- `DEMO-WRONG-0001`: expected on another dispatch doc, useful for WRONG_SERIAL.
- `DEMO-EXCESS-0001`: not expected on `DEMO-DISP-CW-01`, useful for EXCESS.
- `DEMO-DISP-0001`: in stock for dispatch testing.
- `DEMO-SRN-0001`: has an original dispatch scan for SRN testing.
- `DEMO-HERO-0001`: has history events and a correction-ready exception.
- `DEMO-AGE-OLD`: old in-stock serial for ageing.
- `DEMO-AGE-MISSING`: in-stock serial missing `received_at`.

The seed command logs generated IDs for warehouses, products, serials, `cleanSapDispatchDocId`, `dispatchInvoiceId`, and `dispatchInvoiceLineId`. Use those IDs in commands below.

## 4. Health

```bash
curl http://localhost:4000/health
```

## 5. IDM-01 production import

```bash
curl -X POST http://localhost:4000/api/idm-01/import/production \
  -H "Content-Type: application/json" \
  -H "x-user-id: integration_user" \
  -H "x-user-role: admin" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "externalRef": "DEMO-MANUAL-PROD-001",
    "source": "SAP-DEMO",
    "records": [
      {
        "serialNo": "DEMO-MANUAL-0001",
        "productCode": "SKU-INV-1",
        "batchNo": "DEMO-BATCH",
        "warehouseId": 3
      }
    ]
  }'
```

Run the same command twice to confirm duplicate batch handling returns `DUPLICATE_IGNORED`.

## 6. IDM-06 serial validation

Valid serial:

```bash
curl -X POST http://localhost:4000/api/idm-06/validate \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "serialNo": "DEMO-DISP-0001",
    "contextType": "FOUNDATION",
    "warehouseId": 3
  }'
```

Unknown serial:

```bash
curl -X POST http://localhost:4000/api/idm-06/validate \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "serialNo": "DEMO-NOTFOUND-001",
    "contextType": "FOUNDATION"
  }'
```

## 7. IDM-05 dispatch

Replace `$INVOICE_ID` and `$INVOICE_LINE_ID` with the seed output values.

Create dispatch:

```bash
curl -X POST http://localhost:4000/api/idm-05/dispatches \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "invoiceId": '$INVOICE_ID',
    "warehouseId": 3
  }'
```

Scan serial against the created dispatch:

```bash
curl -X POST http://localhost:4000/api/idm-05/dispatches/$DISPATCH_ID/scans \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "invoiceLineId": '$INVOICE_LINE_ID',
    "serialNo": "DEMO-DISP-0001"
  }'
```

Complete dispatch:

```bash
curl -X POST http://localhost:4000/api/idm-05/dispatches/$DISPATCH_ID/complete \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

## 8. IDM-07 fulfilment status

```bash
curl http://localhost:4000/api/idm-07/orders/$INVOICE_ID/status \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

## 9. IDM-08 ageing report

Warehouse `RW-02` usually maps to ID `4` in a clean seed.

```bash
curl "http://localhost:4000/api/idm-08/ageing?warehouseId=4" \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

Expected: `DEMO-AGE-OLD` appears in an aged bucket, and `DEMO-AGE-MISSING` contributes to the missing receipt-date data-quality count.

## 10. Opening-stock reconciliation foundation

Warehouse `RW-01` usually maps to ID `3` in a clean seed.

```bash
curl "http://localhost:4000/api/idm-08/reconciliation/opening-stock/variance?warehouseId=3" \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

## 11. IDM-02 GRN

Use `cleanSapDispatchDocId` from the seed output.

Create GRN:

```bash
curl -X POST http://localhost:4000/api/idm-02/grns \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "sapDispatchDocId": '$SAP_DISPATCH_DOC_ID',
    "warehouseId": 3
  }'
```

Matched scan:

```bash
curl -X POST http://localhost:4000/api/idm-02/grns/$GRN_ID/scans \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{ "serialNo": "DEMO-GRN-0001" }'
```

Excess scan:

```bash
curl -X POST http://localhost:4000/api/idm-02/grns/$GRN_ID/scans \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{ "serialNo": "DEMO-EXCESS-0001" }'
```

Wrong-serial scan:

```bash
curl -X POST http://localhost:4000/api/idm-02/grns/$GRN_ID/scans \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{ "serialNo": "DEMO-WRONG-0001" }'
```

Complete GRN to create SHORT for unscanned expected serials:

```bash
curl -X POST http://localhost:4000/api/idm-02/grns/$GRN_ID/complete \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

## 12. IDM-04 SRN

Create SRN:

```bash
curl -X POST http://localhost:4000/api/idm-04/srns \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{ "warehouseId": 3 }'
```

Scan a valid return:

```bash
curl -X POST http://localhost:4000/api/idm-04/srns/$SRN_ID/scans \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "serialNo": "DEMO-SRN-0001",
    "conditionTag": "SALEABLE"
  }'
```

Run the same scan again to confirm `ALREADY_RETURNED`.

## 13. IDM-09 serial history

```bash
curl http://localhost:4000/api/idm-09/serials/DEMO-HERO-0001/history \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

Expected: a chronological timeline with serial events and a correction-ready exception row.

## 14. IDM-03 battery pre-billing

Use a battery product invoice line. The seed creates invoices with battery products (SKU-BAT-1, SKU-BAT-2).

Commit a battery serial:

```bash
curl -X POST http://localhost:4000/api/idm-03/battery/commit \
  -H "Content-Type: application/json" \
  -H "x-user-id: operator_1" \
  -H "x-user-role: warehouse_operator" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "invoiceLineId": $INVOICE_LINE_ID,
    "serialNo": "DEMO-DISP-0001"
  }'
```

Expected: `{ "valid": true, "status": "COMMITTED" }`. Run the same command again to confirm `ALREADY_COMMITTED` alert.

Check commit status:

```bash
curl http://localhost:4000/api/idm-03/battery/invoices/$INVOICE_ID/status \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

Expected: `{ "invoiceId": $INVOICE_ID, "committedQuantity": 1 }`.

## 15. IDM-10 exception correction

List exceptions:

```bash
curl "http://localhost:4000/api/idm-10/exceptions" \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

Get a specific exception (replace $EXCEPTION_ID):

```bash
curl "http://localhost:4000/api/idm-10/exceptions/$EXCEPTION_ID" \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5"
```

Correct an OPEN exception:

```bash
curl -X POST "http://localhost:4000/api/idm-10/exceptions/$EXCEPTION_ID/correct" \
  -H "Content-Type: application/json" \
  -H "x-user-id: supervisor_1" \
  -H "x-user-role: supervisor" \
  -H "x-warehouse-ids: 1,2,3,4,5" \
  -d '{
    "correctionReason": "Verified manually — serial is valid."
  }'
```

Run the same correction again to confirm 409 Conflict.
