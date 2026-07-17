-- Rollback for V030.

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_transfer_route_check;
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_type_check;

ALTER TABLE invoice
  DROP COLUMN IF EXISTS destination_warehouse_id,
  DROP COLUMN IF EXISTS source_warehouse_id,
  DROP COLUMN IF EXISTS invoice_type;
