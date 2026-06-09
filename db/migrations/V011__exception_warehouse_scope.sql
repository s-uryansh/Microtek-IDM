-- Persist a resolved warehouse_id on exception_log so warehouse scoping is
-- reliable for every context type. Exceptions with context_type BATTERY,
-- IMPORT or FOUNDATION have no grn/dispatch/srn row to join against, so their
-- warehouse_id was previously NULL and they were hidden from warehouse-scoped
-- (non-admin) users. This migration is additive and backfilling only; it does
-- not drop or rewrite any existing migration.

ALTER TABLE exception_log
  ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouse(warehouse_id);

-- Backfill existing rows from whatever warehouse source is resolvable.
-- GRN / DISPATCH / SRN resolve via their context table; BATTERY resolves via
-- invoice_line -> invoice. IMPORT and FOUNDATION rows have no deterministic
-- warehouse source and intentionally stay NULL.
UPDATE exception_log e
SET warehouse_id = g.receiving_warehouse_id
FROM grn g
WHERE e.context_type = 'GRN' AND e.context_id = g.grn_id AND e.warehouse_id IS NULL;

UPDATE exception_log e
SET warehouse_id = d.warehouse_id
FROM dispatch d
WHERE e.context_type = 'DISPATCH' AND e.context_id = d.dispatch_id AND e.warehouse_id IS NULL;

UPDATE exception_log e
SET warehouse_id = s.receiving_warehouse_id
FROM srn s
WHERE e.context_type = 'SRN' AND e.context_id = s.srn_id AND e.warehouse_id IS NULL;

UPDATE exception_log e
SET warehouse_id = i.warehouse_id
FROM invoice_line il
JOIN invoice i ON i.invoice_id = il.invoice_id
WHERE e.context_type = 'BATTERY' AND e.context_id = il.invoice_line_id AND e.warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_exception_warehouse ON exception_log(warehouse_id);
