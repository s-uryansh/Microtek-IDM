DROP INDEX IF EXISTS ix_srn_return_product_ids;

ALTER TABLE srn
  DROP COLUMN IF EXISTS return_product_ids;
