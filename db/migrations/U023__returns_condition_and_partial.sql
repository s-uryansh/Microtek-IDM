-- Rollback V023.

-- 6. Remove the condition-correction permission grants.
DELETE FROM role_permission WHERE permission_code = 'condition:correct';

-- 5. Restore the rule_code CHECK without CONDITION_HOLD.
ALTER TABLE exception_log DROP CONSTRAINT IF EXISTS exception_log_rule_code_check;
ALTER TABLE exception_log
  ADD CONSTRAINT exception_log_rule_code_check CHECK (rule_code IN (
    'MALFORMED_SERIAL',
    'ALREADY_DISPATCHED',
    'DISPATCH_QUANTITY_REACHED',
    'WRONG_WAREHOUSE',
    'NOT_FOUND',
    'PRODUCT_INVOICE_MISMATCH',
    'SHORT',
    'EXCESS',
    'WRONG_SERIAL',
    'UNKNOWN_PRODUCT',
    'DUPLICATE_SERIAL',
    'DUPLICATE_SCAN',
    'IMPORT_FAILED',
    'NO_ORIGINAL_DISPATCH',
    'ALREADY_RETURNED',
    'INVALID_CONDITION_TAG',
    'WRONG_INVOICE_SERIAL',
    'BATTERY_NOT_PREBILLED'
  ));

-- 4. Drop the declared return quantity.
ALTER TABLE srn DROP CONSTRAINT IF EXISTS srn_expected_quantity_check;
ALTER TABLE srn DROP COLUMN IF EXISTS expected_quantity;

-- 3. Restore the original dispatch_scan unique constraint.
DROP INDEX IF EXISTS ux_dispatch_scan_active;
ALTER TABLE dispatch_scan
  ADD CONSTRAINT dispatch_scan_dispatch_id_serial_id_key UNIQUE (dispatch_id, serial_id);
ALTER TABLE dispatch_scan
  DROP COLUMN IF EXISTS returned_by,
  DROP COLUMN IF EXISTS returned_at;

-- 2. Restore the invoice status CHECK without PARTIALLY_DISPATCHED.
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_status_check;
ALTER TABLE invoice
  ADD CONSTRAINT invoice_status_check
  CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DISPATCHED'));

-- 1. Drop the serial condition tag.
DROP INDEX IF EXISTS ix_serial_condition_hold;
ALTER TABLE serial_master DROP CONSTRAINT IF EXISTS serial_master_condition_tag_check;
ALTER TABLE serial_master DROP COLUMN IF EXISTS condition_tag;
