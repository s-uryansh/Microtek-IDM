# CSV Field Reference

Last updated: 2026-06-08

CSV support is an operational fallback. It does not replace QR/barcode scanning or manual entry. All scanner workflows keep manual fields visible so operators can continue work when cameras, browser APIs, barcode guns, or network conditions are unreliable.

## General Rules

- Files must be comma-separated CSV.
- Header row is required.
- Column names are case-sensitive in the current web importer.
- Blank lines are ignored.
- Imports allow partial success.
- Rejected rows are downloadable as CSV with an added `error` column.
- Imports are processed through the same API paths used by scan/manual entry.

## IDM-01 Production Import

Purpose: import production serials.

Required columns:
- `serialNo`
- `productCode`

Optional columns:
- `batchNo`
- `warehouseId`

Sample CSV:

```csv
serialNo,productCode,batchNo,warehouseId
MTK-PROD-0001,MTK-INVERTER-1KVA,BATCH-01,3
MTK-PROD-0002,MTK-BATTERY-100AH,BATCH-01,3
```

Validation rules:
- `serialNo` must match the backend serial format.
- `productCode` must exist and be active.
- `warehouseId`, when provided, must be numeric.
- Duplicate batch references are idempotently ignored by the backend.

Expected outputs/errors:
- Output summary includes imported and rejected counts.
- Rejections include row/index, serial, and reason such as unknown product or malformed data.

## IDM-02 GRN

Purpose: bulk scan received serials into an active GRN.

Required context before import:
- Active GRN session.
- GRN can be started by lookup/selecting SAP dispatch document or by manually entering SAP dispatch document ID and receiving warehouse ID.

Required columns:
- `serial_no`

Optional columns:
- None.

Sample CSV:

```csv
serial_no
MTK-INTRANSIT-0001
MTK-INTRANSIT-0002
```

Validation rules:
- Active GRN session must exist.
- Serial must be valid for GRN context.
- Backend classifies each row as matched, short, excess, wrong serial, duplicate scan, or rejected.

Expected outputs/errors:
- Export columns: `serial_no`, `match_status`, `message`.
- Rejected rows include API validation or scan result errors.

## IDM-03 Battery Pre-Bill

Purpose: bulk commit battery serials to a selected invoice line.

Required context before import:
- `invoiceLineId` is mandatory.
- Operators can select invoice and battery invoice line through lookup or manually enter Invoice Line ID.

Required columns:
- `serial_no`

Optional columns:
- None.

Sample CSV:

```csv
serial_no
MTK-BAT100-0001
MTK-BAT100-0002
```

Validation rules:
- Invoice line must exist.
- Invoice line must be a battery product.
- Serial must be in the correct warehouse.
- Serial product must match the invoice line product.
- Serial must not already be committed.

Expected outputs/errors:
- Export columns: `serial_no`, `invoice_line_id`, `status`, `message`.
- Errors include missing invoice line context, non-battery line, product mismatch, wrong warehouse, already committed, and not found.

## IDM-04 SRN

Purpose: bulk process returned serials into an active SRN.

Required context before import:
- Active SRN session.
- Receiving warehouse ID is mandatory.
- Condition tag can be selected on screen or supplied per CSV row.

Required columns:
- `serial_no`

Optional columns:
- `condition_tag`

Sample CSV:

```csv
serial_no,condition_tag
DEMO-SRN-0001,SALEABLE
DEMO-SRN-0002,DEFECTIVE
```

Validation rules:
- Active SRN session must exist.
- `condition_tag`, when supplied, must be one of `SALEABLE`, `DEFECTIVE`, `REPAIR`.
- A legitimately `DISPATCHED` serial is allowed for SRN validation.
- Serial must reconcile to an original dispatch scan.
- Serial must not already be returned.

Expected outputs/errors:
- Export columns: `serial_no`, `condition_tag`, `status`, `message`.
- Errors include invalid condition tag, no original dispatch, already returned, not found, and malformed serial.

## IDM-05 Dispatch

Purpose: bulk scan dispatch serials against a selected invoice line.

Required context before import:
- Active dispatch session.
- `invoiceLineId` is mandatory.
- Operators can select invoice and invoice line through lookup or manually enter Invoice Line ID.

Required columns:
- `serial_no`

Optional columns:
- None.

Sample CSV:

```csv
serial_no
MTK-INV1K-0001
MTK-INV1K-0002
```

Validation rules:
- Dispatch session must exist.
- Invoice line must belong to the dispatch invoice.
- Serial must be in stock in the dispatch warehouse.
- Serial product must match the invoice line product.
- Invoice line quantity must not already be fully scanned.

Expected outputs/errors:
- Export columns: `serial_no`, `invoice_line_id`, `status`, `message`.
- Errors include missing invoice line context, product mismatch, wrong warehouse, already dispatched, duplicate scan, and not found.

## IDM-07 Fulfilment

Purpose: bulk fetch fulfilment status for invoice IDs.

Required columns:
- `invoice_id`

Optional columns:
- None.

Sample CSV:

```csv
invoice_id
100
101
```

Validation rules:
- `invoice_id` must be a positive integer.
- Caller must have warehouse scope for the invoice warehouse.

Expected outputs/errors:
- Export columns: `invoice_id`, `status`, `required_quantity`, `scanned_quantity`, `committed_quantity`.
- Errors include invalid invoice ID, not found, and forbidden warehouse scope.

## IDM-09 Serial History

Purpose: bulk fetch serial timelines.

Required columns:
- `serial_no`

Optional columns:
- None.

Sample CSV:

```csv
serial_no
MTK-LIFECYCLE-0001
MTK-INV1K-0001
```

Validation rules:
- `serial_no` must be non-empty.
- Caller must have warehouse scope over the serial history warehouse set.

Expected outputs/errors:
- Export columns: `serial_no`, `type`, `at`, `eventType`, `ruleCode`, `referenceType`, `referenceId`, `warehouseId`, `status`.
- Errors include not found and forbidden warehouse scope.

## IDM-10 Exceptions

Purpose: bulk load exception IDs for review/export. Bulk correction is not implemented because correction requires manual review and reason entry.

Required columns:
- `exception_id`

Optional columns:
- None.

Sample CSV:

```csv
exception_id
1
2
```

Validation rules:
- `exception_id` must be a positive integer.
- Caller must have permission and warehouse scope for the exception.

Expected outputs/errors:
- List export columns: `exceptionId`, `serialNo`, `ruleCode`, `contextType`, `status`, `raisedAt`.
- Reviewed-detail export columns: `exceptionId`, `serialNo`, `ruleCode`, `status`, `correctedAt`, `correctedBy`, `correctionReason`.
- Errors include invalid exception ID, not found, forbidden warehouse scope, and correction conflicts.
