-- V028: Invoice-gate warehouse-to-warehouse transfers (Finding #3).
--
-- A warehouse-to-warehouse transfer reuses the sap_dispatch_doc / sap_dispatch_line
-- pipeline (see warehouseTransferService.js). Until now a transfer moved any
-- IN_STOCK serial with no reference to what was authorised to move. This mirrors
-- the customer-dispatch invoice check onto the transfer: the doc now references a
-- gating invoice, and each scanned serial's product must match an invoice line
-- that still has remaining quantity (PRODUCT_INVOICE_MISMATCH otherwise).
--
-- The column is NULLABLE on purpose: SAP factory imports (importService.js) create
-- sap_dispatch_doc rows with no invoice, and pre-existing transfer docs stay valid.
-- Only the transfer service enforces that an invoice is present for a transfer.

ALTER TABLE sap_dispatch_doc
  ADD COLUMN IF NOT EXISTS invoice_id BIGINT REFERENCES invoice(invoice_id);

-- Look up the gating invoice for a doc, and the transfer docs opened per invoice.
CREATE INDEX IF NOT EXISTS ix_sap_dispatch_doc_invoice
  ON sap_dispatch_doc(invoice_id)
  WHERE invoice_id IS NOT NULL;
