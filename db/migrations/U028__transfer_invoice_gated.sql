-- Rollback V028: drop the invoice gate on warehouse transfers.

DROP INDEX IF EXISTS ix_sap_dispatch_doc_invoice;

ALTER TABLE sap_dispatch_doc
  DROP COLUMN IF EXISTS invoice_id;
