-- Rollback V027: remove composed serial identity, restore raw base serials.

-- 1. Drop the composition trigger + function.
DROP TRIGGER IF EXISTS trg_serial_master_compose ON serial_master;
DROP FUNCTION IF EXISTS serial_master_compose_identity();

-- 2. Restore serial_no to the raw base serial before shrinking the column.
UPDATE serial_master
   SET serial_no = base_serial
 WHERE base_serial IS NOT NULL
   AND serial_no <> base_serial;

-- 3. Drop the per-product base constraint/index and the column.
ALTER TABLE serial_master DROP CONSTRAINT IF EXISTS uq_serial_product_base;
DROP INDEX IF EXISTS ix_serial_base;
ALTER TABLE serial_master DROP COLUMN IF EXISTS base_serial;

-- 4. Revert column widths (base serials fit in 80).
ALTER TABLE serial_master ALTER COLUMN serial_no TYPE VARCHAR(80);
ALTER TABLE exception_log ALTER COLUMN serial_no TYPE VARCHAR(80);

-- 5. Restore the rule_code CHECK without AMBIGUOUS_SERIAL (back to V023 state).
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
    'BATTERY_NOT_PREBILLED',
    'CONDITION_HOLD'
  ));
