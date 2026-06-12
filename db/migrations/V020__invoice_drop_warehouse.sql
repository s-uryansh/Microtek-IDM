-- Invoices are no longer tied to a warehouse. A warehouse is only ever
-- attached to physical stock (serials) and to the dispatch session that the
-- operator runs from their assigned warehouse. The invoice itself is
-- warehouse-agnostic: any operator can dispatch any invoice, and validation
-- enforces that each scanned serial physically lives in their warehouse.

DROP INDEX IF EXISTS ix_invoice_warehouse_status;

ALTER TABLE invoice
  DROP COLUMN IF EXISTS warehouse_id;
