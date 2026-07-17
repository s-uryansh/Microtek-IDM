-- SRN non-original stock handling (Finding 8)
--
-- Some returns physically contain products that were never on the original
-- invoice (e.g. 40 original + 10 different items). The operator declares up
-- front, on the SRN header, whether foreign stock may be present. When it is,
-- a returned serial that does not reconcile to a dispatch on this invoice is
-- no longer blocked — it is received into stock and flagged NOT ORIGINAL both
-- on the return scan and on the inventory (serial_master) record.

-- 1. Operator's up-front declaration on the SRN header.
ALTER TABLE srn
  ADD COLUMN IF NOT EXISTS allows_foreign_stock BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Per-scan marker: this returned serial was not on the original invoice.
ALTER TABLE srn_scan
  ADD COLUMN IF NOT EXISTS not_original BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Inventory-level flag so stock views can surface a NOT ORIGINAL return.
ALTER TABLE serial_master
  ADD COLUMN IF NOT EXISTS not_original BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_serial_not_original
  ON serial_master(current_warehouse_id)
  WHERE not_original = TRUE;
