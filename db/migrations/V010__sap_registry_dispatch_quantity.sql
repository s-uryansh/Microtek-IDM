ALTER TABLE serial_master
  ADD COLUMN IF NOT EXISTS original_dispatch_warehouse_id BIGINT REFERENCES warehouse(warehouse_id),
  ADD COLUMN IF NOT EXISTS destination_warehouse_id BIGINT REFERENCES warehouse(warehouse_id),
  ADD COLUMN IF NOT EXISTS qr_payload TEXT;

CREATE INDEX IF NOT EXISTS ix_serial_destination_warehouse
ON serial_master(destination_warehouse_id, current_status);

ALTER TABLE dispatch
  ADD COLUMN IF NOT EXISTS target_quantity INTEGER CHECK (target_quantity IS NULL OR target_quantity > 0);

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
    'INVALID_CONDITION_TAG'
  ));
