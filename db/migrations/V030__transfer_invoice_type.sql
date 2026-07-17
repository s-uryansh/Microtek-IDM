-- V030: Distinct TRANSFER invoices for warehouse-to-warehouse transfers.
--
-- A warehouse transfer is invoice-gated (V028), but until now it was gated by a
-- plain customer invoice that says nothing about the route. A TRANSFER invoice
-- now carries the route itself: source_warehouse_id (stock leaves here) and
-- destination_warehouse_id (stock is received here via GRN). Customer invoices
-- keep both columns NULL — invoices dropped their warehouse column in V020 and
-- customer dispatch still picks the warehouse at dispatch time.
--
-- Enforcement lives in the services: warehouseTransferService only accepts
-- TRANSFER invoices whose route matches the transfer, and dispatchService
-- rejects TRANSFER invoices outright.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN IF NOT EXISTS source_warehouse_id BIGINT REFERENCES warehouse(warehouse_id),
  ADD COLUMN IF NOT EXISTS destination_warehouse_id BIGINT REFERENCES warehouse(warehouse_id);

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_type_check;
ALTER TABLE invoice
  ADD CONSTRAINT invoice_type_check CHECK (invoice_type IN ('CUSTOMER', 'TRANSFER'));

-- A TRANSFER invoice must name a full route between two different warehouses;
-- a CUSTOMER invoice must not carry a route at all.
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_transfer_route_check;
ALTER TABLE invoice
  ADD CONSTRAINT invoice_transfer_route_check CHECK (
    (invoice_type = 'CUSTOMER' AND source_warehouse_id IS NULL AND destination_warehouse_id IS NULL)
    OR (
      invoice_type = 'TRANSFER'
      AND source_warehouse_id IS NOT NULL
      AND destination_warehouse_id IS NOT NULL
      AND source_warehouse_id <> destination_warehouse_id
    )
  );
