DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'exception_log'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%rule_code%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE exception_log DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE exception_log
  ADD CONSTRAINT exception_log_rule_code_check CHECK (rule_code IN (
    'MALFORMED_SERIAL',
    'ALREADY_DISPATCHED',
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
    'INVALID_CONDITION_TAG'
  ));

ALTER TABLE dispatch
  DROP COLUMN IF EXISTS target_quantity;

DROP INDEX IF EXISTS ix_serial_destination_warehouse;

ALTER TABLE serial_master
  DROP COLUMN IF EXISTS qr_payload,
  DROP COLUMN IF EXISTS destination_warehouse_id,
  DROP COLUMN IF EXISTS original_dispatch_warehouse_id;
