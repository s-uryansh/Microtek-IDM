DROP INDEX IF EXISTS ix_exception_warehouse;

ALTER TABLE exception_log
  DROP COLUMN IF EXISTS warehouse_id;
