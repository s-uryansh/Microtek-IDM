-- Rollback V029.
DROP INDEX IF EXISTS ix_serial_not_original;

ALTER TABLE serial_master DROP COLUMN IF EXISTS not_original;

ALTER TABLE srn_scan DROP COLUMN IF EXISTS not_original;

ALTER TABLE srn DROP COLUMN IF EXISTS allows_foreign_stock;
