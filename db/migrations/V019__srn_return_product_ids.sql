ALTER TABLE srn
  ADD COLUMN IF NOT EXISTS return_product_ids JSONB;

CREATE INDEX IF NOT EXISTS ix_srn_return_product_ids
  ON srn USING gin (return_product_ids);
