DROP INDEX IF EXISTS ix_rejection_batch;
DROP TABLE IF EXISTS integration_batch_rejection;

ALTER TABLE integration_batch
  DROP COLUMN IF EXISTS source_label;

ALTER TABLE dispatch
  DROP COLUMN IF EXISTS sap_outbound_batch_id;
