-- Rollback for V020. The original warehouse_id was NOT NULL, but historical
-- per-invoice warehouse data cannot be recovered once dropped, so it is
-- re-added as nullable. Backfill from another source if the NOT NULL
-- constraint is required again.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouse(warehouse_id);

CREATE INDEX IF NOT EXISTS ix_invoice_warehouse_status ON invoice(warehouse_id, status);
