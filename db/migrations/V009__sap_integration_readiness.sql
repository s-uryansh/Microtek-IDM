ALTER TABLE integration_batch
  ADD COLUMN IF NOT EXISTS source_label VARCHAR(60);

CREATE TABLE IF NOT EXISTS integration_batch_rejection (
    rejection_id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES integration_batch(batch_id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    serial_no TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_batch_row UNIQUE (batch_id, row_index)
);

CREATE INDEX IF NOT EXISTS ix_rejection_batch ON integration_batch_rejection(batch_id);

ALTER TABLE dispatch
  ADD COLUMN IF NOT EXISTS sap_outbound_batch_id VARCHAR(80);
