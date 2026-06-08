# Wave 5 Implementation Report

Last updated: 2026-06-08

This report documents code-review findings and implementation work completed for operational resilience, Android scanner diagnostics, SRN return handling, warehouse-scope authorization, lookup/search, and CSV fallback workflows. No physical Android device testing was performed by the developer.

## 1. Android Scanner Investigation

Reviewed:
- `client/src/hooks/useScanner.js`
- `client/src/components/scan/ScanCamera.jsx`
- `client/src/components/scan/ScanScanner.jsx`
- `client/src/components/scan/ScanSession.jsx`

Findings:
- Camera startup previously collapsed multiple causes into the same unsupported-browser message.
- The generic message could appear on Android when `navigator.mediaDevices` is unavailable because the portal is not served over HTTPS, camera APIs are blocked by browser policy, or camera capture is unavailable.
- User Android testing later confirmed HTTPS/ngrok resolved the secure-context blocker and QR camera scanning starts.
- Native `BarcodeDetector` absence alone should not make Android unsupported because `@zxing/browser` fallback is bundled.
- Battery QR scans decode the serial, but invoice line context is still required before commit.
- Hardware scanner and manual entry remain available even when camera scanning is unavailable.

Compatibility notes:
- Android Chrome, Edge Mobile, Samsung Internet, and rugged Chromium devices still require HTTPS or localhost for browser camera APIs.
- Native `BarcodeDetector` support varies by browser/version.
- ZXing fallback requires `MediaDevices.getUserMedia`.

## 2. Scanner Fixes

Implemented:
- Added explicit camera support diagnostics in `useScanner`.
- Added unsupported-state messages for:
  - Secure context required.
  - Navigator API unavailable.
  - MediaDevices unavailable.
  - Camera capture API unavailable.
  - Barcode decoder unavailable.
  - Camera startup failure.
- Displayed diagnostics in `ScanCamera`:
  - Secure context
  - MediaDevices
  - Camera capture
  - Native BarcodeDetector
  - ZXing fallback
- Added duplicate cooldown in `useScanSession` so repeated same-code camera frames do not spam duplicate warnings.
- Battery and Dispatch scan controls now stay disabled until invoice line context is selected or manually entered.

Files changed:
- `client/src/hooks/useScanner.js`
- `client/src/components/scan/ScanCamera.jsx`
- `client/src/styles/scan.css`
- `client/test/hooks/useScanner.test.jsx`

## 3. SRN Review Findings

Finding:
- IDM-06 validation rejected every `DISPATCHED` serial before SRN-specific original-dispatch validation could run.
- A legitimate returned serial is expected to be `DISPATCHED` before SRN receipt.

Fix:
- `DISPATCHED` serials are now allowed only when `contextType` is `SRN`.
- Other validation contexts still reject dispatched serials with `ALREADY_DISPATCHED`.

Files changed:
- `server/src/idm06/validationService.js`
- `server/test/idm06-validation-service.test.js`

## 4. Authorization Fixes

Patched warehouse-scope gaps:
- IDM-03 battery invoice status.
- IDM-07 fulfilment status.
- IDM-09 serial history.

Implementation:
- Battery status now checks invoice warehouse before returning commit status.
- Fulfilment status now checks returned invoice warehouse against caller scope.
- Serial history now derives readable warehouse IDs from current serial warehouse and serial events before returning timeline data.

Files changed:
- `server/src/idm03/batteryPreBillingRoutes.js`
- `server/src/idm03/batteryPreBillingService.js`
- `server/src/idm07/fulfilmentStatusRoutes.js`
- `server/src/idm09/serialHistoryRoutes.js`
- `server/src/idm09/serialHistoryService.js`
- `server/src/db/serialHistoryRepository.js`

Regression tests:
- `server/test/idm03-battery-routes.test.js`
- `server/test/idm07-fulfilment-routes.test.js`
- `server/test/idm09-history-routes.test.js`

## 5. Search / Lookup Improvements

Implemented backend lookup API:
- `GET /api/lookups/warehouses`
- `GET /api/lookups/invoices`
- `GET /api/lookups/dispatch-docs`
- `GET /api/lookups/dispatches`

Lookup behavior:
- All lookup routes require authentication and `foundation:read`.
- Non-admin users are scoped to assigned warehouses.
- Requested warehouse filters outside caller scope are denied.

Frontend workflow improvements:
- GRN: search SAP dispatch document and auto-fill dispatch document ID and destination warehouse.
- Dispatch: search invoice, auto-fill invoice ID/warehouse ID, and select invoice line.
- Battery: search battery invoice and select battery invoice line.
- SRN: search original invoice or dispatch to help select receiving warehouse.

Manual override retained:
- SAP dispatch document ID.
- Invoice ID.
- Invoice line ID.
- Dispatch/warehouse IDs.
- Serial number fields.

Files changed:
- `server/src/lookups/lookupRoutes.js`
- `server/src/lookups/lookupService.js`
- `server/src/db/lookupRepository.js`
- `server/src/db/repositories.js`
- `server/src/app.js`
- `client/src/api/modules/lookups.js`
- `client/src/components/operations/LookupSelector.jsx`
- Workflow pages under `client/src/features/`

## 6. Bulk Import Features

Implemented CSV import fallback for:
- IDM-02 GRN: `serial_no`
- IDM-03 Battery: `serial_no`
- IDM-04 SRN: `serial_no,condition_tag`
- IDM-05 Dispatch: `serial_no`
- IDM-07 Fulfilment: `invoice_id`
- IDM-09 Serial History: `serial_no`
- IDM-10 Exceptions: `exception_id` for review/export only

Behavior:
- Imports process rows through existing scan/commit APIs.
- Successful and rejected row counts are shown.
- Rejected rows are downloadable as CSV.
- Partial success is allowed.
- Manual entry and scanner entry remain active.

Limitations:
- Bulk imports run in the browser and are suitable for operational fallback, not a durable offline queue.
- Exports for scan modules cover rows processed in the current browser session.

## 7. Bulk Export Features

Implemented CSV export for:
- IDM-01 production import rejections.
- IDM-02 GRN scan results.
- IDM-03 battery committed serials in current session.
- IDM-04 processed returns in current session.
- IDM-05 dispatched serials in current session.
- IDM-07 fulfilment status results.
- IDM-08 ageing report and opening-stock variance rows.
- IDM-09 serial timeline.
- IDM-10 exception list and selected exception/correction detail.

## 8. CSV Formats

Templates:
- Production import: `serialNo,productCode,batchNo,warehouseId`
- GRN import: `serial_no`
- Battery import: `serial_no`
- SRN import: `serial_no,condition_tag`
- Dispatch import: `serial_no`
- Fulfilment import: `invoice_id`
- Ageing export: `label,quantity`
- Variance export: `reconciliationRunId,warehouseId,productId,sapQuantity,idmQuantity,varianceQuantity`
- Serial history import: `serial_no`
- History export: `type,at,eventType,ruleCode,referenceType,referenceId,warehouseId,status`
- Exception review import: `exception_id`
- Exception export: `exceptionId,serialNo,ruleCode,contextType,status,raisedAt`
- Correction export: `exceptionId,serialNo,ruleCode,status,correctedAt,correctedBy,correctionReason`

Shared files:
- `client/src/utils/csv.js`
- `client/src/components/operations/BulkCsvTools.jsx`

## 9. New Tests

Backend:
- Lookup route tests.
- SRN validation regression.
- Battery status warehouse-scope regression.
- Fulfilment status warehouse-scope regression.
- Serial history warehouse-scope regression.

Frontend:
- CSV utility parsing/escaping tests.
- Lookup API module contract tests.
- Scanner secure-context diagnostic regression.

Focused verification performed during implementation:
- Backend focused suite: 5 test files, 19 tests passed.
- Frontend focused suite: 12 test files, 83 tests passed.

Full verification commands are recorded in the final delivery response after running:
- `npm test`
- `npm run lint`
- `npm run build`

## 10. Remaining Technical Debt

- No physical Android or rugged-device testing was performed by the developer.
- No durable offline queue, sync engine, or conflict resolution exists.
- CSV bulk imports are browser-session workflows, not backend batch jobs.
- No backend export endpoints exist; frontend exports currently use loaded/current-session data.
- Dispatch and Battery backend APIs still require invoice line ID for scan calls.
- SRN still lacks a complete/close endpoint.
- SAP inbound/outbound transports remain absent.
- Exception correction intentionally does not support bulk correction.
- Scanner behavior still depends on HTTPS, browser camera permission, and device camera availability.
