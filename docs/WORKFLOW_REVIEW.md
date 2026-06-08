# Workflow Review

Last updated: 2026-06-08

This review covers the operator workflows that are active in the React portal and Express API after Wave 5. Manual entry remains a required fallback and must not be removed.

## IDM-02 GRN

Current workflow:
1. Operator searches for a SAP dispatch document by reference or document ID, or manually enters SAP dispatch document ID.
2. Operator enters or confirms receiving warehouse ID.
3. Operator starts a GRN session.
4. Operator scans or types serials.
5. Operator completes the GRN to record matched, short, excess, wrong, and duplicate outcomes.

Required user inputs:
- SAP dispatch document ID, preferably selected from lookup.
- Receiving warehouse ID, preferably populated from selected dispatch document.
- Serial number for each received item.

Scanner workflow:
- Camera scan through `ScanSession`.
- Hardware keyboard-wedge scanner through the focused scan field.
- Duplicate detection and result history through shared scan hooks.

Manual-entry workflow:
- SAP dispatch document ID and warehouse ID fields remain visible.
- Serial field accepts typed serials and Enter-key submission.

Missing fallback workflows:
- No GRN document list with persistent status filter beyond lookup results.
- No print-ready receiving checklist.

Bulk workflows:
- CSV template: `serial_no`.
- CSV import processes rows through the existing GRN scan API with partial success.
- CSV export includes `serial_no`, `match_status`, and `message`.
- Rejected rows are downloadable from the bulk panel.

## IDM-03 Battery

Current workflow:
1. Operator searches battery invoices or manually enters invoice line ID.
2. Operator selects a battery invoice line when lookup data is available.
3. Operator scans or types battery serials for pre-billing commit.
4. Operator can check invoice-level commit status by invoice ID.

Required user inputs:
- Invoice line ID for commits.
- Invoice ID for status checks.
- Serial number for each battery.

Scanner workflow:
- Camera and hardware scanner paths use the shared scan session.
- The commit API validates product, warehouse, invoice line, and duplicate commit.

Manual-entry workflow:
- Invoice line ID and invoice ID fields remain available.
- Serial field remains available for typed serial fallback.

Missing fallback workflows:
- No direct invoice reference status lookup without selecting/typing internal invoice ID.
- No committed-serial list endpoint; export covers rows processed in the current browser session.

Bulk workflows:
- CSV template: `serial_no`.
- CSV import commits each serial through the battery commit API.
- CSV export includes `serial_no`, `invoice_line_id`, `status`, and `message`.
- Rejected rows are downloadable.

## IDM-04 SRN

Current workflow:
1. Operator searches original invoice or dispatch, or manually enters receiving warehouse ID.
2. Operator starts an SRN session.
3. Operator selects condition tag.
4. Operator scans or types returned serials.
5. Backend verifies original dispatch scan and duplicate return state.

Required user inputs:
- Receiving warehouse ID.
- Condition tag: `SALEABLE`, `DEFECTIVE`, or `REPAIR`.
- Returned serial number.

Scanner workflow:
- Camera and hardware scanner paths use shared scan components.
- SRN now permits legitimately `DISPATCHED` serials in validation before checking original dispatch scan.

Manual-entry workflow:
- Warehouse ID field remains visible.
- Condition tag selector remains visible before and during the scan session.
- Serial field remains available for typed fallback.

Missing fallback workflows:
- No SRN complete/close endpoint.
- No final client-approved return condition taxonomy.

Bulk workflows:
- CSV template: `serial_no,condition_tag`.
- CSV import processes rows through the SRN scan API.
- CSV export includes `serial_no`, `condition_tag`, `status`, and `message`.
- Rejected rows are downloadable.

## IDM-05 Dispatch

Current workflow:
1. Operator searches invoice by business reference or invoice ID, or manually enters invoice ID.
2. Operator enters or confirms warehouse ID.
3. Operator starts dispatch session.
4. Operator selects invoice line from lookup results or manually enters invoice line ID.
5. Operator scans or types serials.
6. Operator completes dispatch when required quantity is scanned.

Required user inputs:
- Invoice ID.
- Warehouse ID.
- Invoice line ID for each scan.
- Serial number.

Scanner workflow:
- Camera scanner, hardware scanner, and manual serial field all use the shared scan session.
- Backend validates invoice line, stock status, warehouse, product, quantity, and duplicate dispatch.

Manual-entry workflow:
- Invoice ID, warehouse ID, and invoice line ID fields remain visible.
- Serial field remains available.

Missing fallback workflows:
- No dispatch list/detail endpoint outside lookup.
- No SAP outbound confirmation transport.

Bulk workflows:
- CSV template: `serial_no`.
- CSV import scans each serial against the currently selected invoice line.
- CSV export includes `serial_no`, `invoice_line_id`, `status`, and `message`.
- Rejected rows are downloadable.

## IDM-10 Exception Correction

Current workflow:
1. Supervisor loads exception list.
2. Supervisor filters by status.
3. Supervisor opens an exception detail.
4. Supervisor enters a correction reason.
5. Backend transaction marks the exception corrected and writes a correction event when serial context is resolvable.

Required user inputs:
- Optional status filter.
- Exception row selection.
- Correction reason.

Scanner workflow:
- No scanner workflow is required for exception correction.

Manual-entry workflow:
- Correction reason remains a typed field.
- Row selection remains table-based.

Missing fallback workflows:
- No bulk correction workflow, by design; correction requires human review and reason.
- Exceptions without resolvable warehouse context may remain admin-only.

Bulk workflows:
- CSV template/export for exception list.
- CSV export for selected exception/correction detail.
- CSV template/import `exception_id` loads exception details for review/export.
- Bulk correction import is not implemented because it is operationally risky.

## IDM-07 Fulfilment

Current workflow:
1. Operator scans invoice ID, imports invoice IDs by CSV, or manually enters invoice ID.
2. System loads fulfilment status for the invoice.
3. Operator exports loaded fulfilment results.

Required user inputs:
- Invoice ID.

Scanner workflow:
- QR/barcode scanner can enter invoice ID through `ScanSession`.
- Hardware scanner and camera scanner are supported through the shared scanner.

Manual-entry workflow:
- Invoice ID field remains visible.

Missing fallback workflows:
- No invoice status list endpoint; the page loads invoices one at a time or through CSV import.

Bulk workflows:
- CSV template: `invoice_id`.
- CSV import fetches fulfilment status for each invoice ID.
- CSV export includes `invoice_id`, `status`, `required_quantity`, `scanned_quantity`, and `committed_quantity`.

## IDM-09 Serial History

Current workflow:
1. Operator scans serial, imports serials by CSV, or manually enters serial number.
2. System loads the serial timeline.
3. Operator exports timeline rows.

Required user inputs:
- Serial number.

Scanner workflow:
- QR/barcode, hardware scanner, and typed scan input are supported.

Manual-entry workflow:
- Serial Number field remains visible.

Missing fallback workflows:
- No backend bulk history endpoint; CSV import performs repeated single-serial lookups in the browser.

Bulk workflows:
- CSV template: `serial_no`.
- CSV import loads history for each serial.
- CSV export includes `serial_no`, `type`, `at`, `eventType`, `ruleCode`, `referenceType`, `referenceId`, `warehouseId`, and `status`.

## Cross-Workflow Findings

- Manual serial, invoice, dispatch, return, and warehouse ID entry remain available.
- New lookup flows reduce dependence on internal IDs but do not remove override fields.
- CSV import is implemented as an operator fallback for serial-heavy workflows, with row-level rejection tracking in the browser.
- CSV exports are implemented for current-session scan/commit/return results and visible report/list data.
- Camera scanning remains optional. Hardware scanner and typed entry are required operational fallbacks.
- Battery and Dispatch require invoice line context before scanning serials; operators can select the line or manually enter Invoice Line ID.
- Repeated camera frames for the same QR/barcode are suppressed through duplicate cooldown to avoid warning spam.
- Offline queue/sync remains absent; CSV import can help during scanner failure but is not an offline sync substitute.
