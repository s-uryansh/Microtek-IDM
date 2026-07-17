-- V027: Composed serial identity.
--
-- serial_master.serial_no becomes `<PRODUCT_PREFIX>_<baseSerial>`, e.g. product
-- "Inverter 1KVA" + scanned base "SKU-110E" => "INVERTER_1KVA_SKU-110E".
--
-- WHY: two different products can be stamped with the same physical base serial
-- (an inverter and a charge controller both "SKU-100E"). The composed serial_no
-- stays globally UNIQUE and every inventory/warehouse record is disambiguated by
-- product, while operators still SCAN the raw base serial (GRN/dispatch resolve
-- it via product context).
--
-- The composition rule below is the single source of truth. It is mirrored in
-- server/src/utils/serialName.js for the read path and tests — KEEP THEM IN SYNC:
--   prefix = UPPER(product.name), every run of non-alphanumerics collapsed to a
--   single '_', leading/trailing '_' trimmed; serial_no = prefix || '_' || base.

-- 1. Widen the columns that carry a serial string (prefix + base can exceed 80).
--    The ageing_serial_snapshot materialized view (V004) selects serial_master.
--    serial_no, so Postgres refuses to alter the column type while it exists.
--    Drop it here (CASCADE also drops its two indexes) and recreate it verbatim
--    in step 7, once the column change and backfill are complete.
DROP MATERIALIZED VIEW IF EXISTS ageing_serial_snapshot CASCADE;

ALTER TABLE serial_master ALTER COLUMN serial_no TYPE VARCHAR(255);
ALTER TABLE exception_log ALTER COLUMN serial_no TYPE VARCHAR(255);

-- 2. Add the base_serial column (the raw scanned serial, unique per product).
ALTER TABLE serial_master ADD COLUMN IF NOT EXISTS base_serial VARCHAR(80);

-- 3. Backfill existing rows (idempotent). Runs before the trigger exists; the
--    trigger is BEFORE INSERT only so these UPDATEs are unaffected regardless.
UPDATE serial_master
   SET base_serial = serial_no
 WHERE base_serial IS NULL;

UPDATE serial_master sm
   SET serial_no = p.prefix || '_' || sm.base_serial
  FROM (
    SELECT product_id,
           trim(both '_' from regexp_replace(upper(name), '[^A-Z0-9]+', '_', 'g')) AS prefix
      FROM product
  ) p
 WHERE p.product_id = sm.product_id
   AND p.prefix <> ''
   AND left(sm.serial_no, length(p.prefix) + 1) <> p.prefix || '_';

ALTER TABLE serial_master ALTER COLUMN base_serial SET NOT NULL;

-- 4. Constraints: keep the existing global UNIQUE(serial_no) from V002; add the
--    per-product uniqueness on the base serial and an index for base lookups.
ALTER TABLE serial_master DROP CONSTRAINT IF EXISTS uq_serial_product_base;
ALTER TABLE serial_master ADD CONSTRAINT uq_serial_product_base UNIQUE (product_id, base_serial);
CREATE INDEX IF NOT EXISTS ix_serial_base ON serial_master(base_serial);

-- 5. Composition trigger — the single source of truth (mirrored in serialName.js).
CREATE OR REPLACE FUNCTION serial_master_compose_identity()
RETURNS TRIGGER AS $$
DECLARE
  v_name   TEXT;
  v_prefix TEXT;
  v_base   TEXT;
BEGIN
  SELECT name INTO v_name FROM product WHERE product_id = NEW.product_id;
  v_prefix := trim(both '_' from regexp_replace(upper(coalesce(v_name, '')), '[^A-Z0-9]+', '_', 'g'));

  IF NEW.base_serial IS NOT NULL THEN
    -- Caller supplied the base explicitly.
    v_base := NEW.base_serial;
  ELSIF v_prefix <> '' AND left(NEW.serial_no, length(v_prefix) + 1) = v_prefix || '_' THEN
    -- serial_no already carries the prefix (re-entrant / already-composed insert):
    -- recover the base so we never double-prefix.
    v_base := substring(NEW.serial_no FROM length(v_prefix) + 2);
  ELSE
    -- serial_no holds the raw scanned base serial.
    v_base := NEW.serial_no;
  END IF;

  NEW.base_serial := v_base;
  IF v_prefix <> '' THEN
    NEW.serial_no := v_prefix || '_' || v_base;
  ELSE
    NEW.serial_no := v_base;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_serial_master_compose ON serial_master;
CREATE TRIGGER trg_serial_master_compose
  BEFORE INSERT ON serial_master
  FOR EACH ROW
  EXECUTE FUNCTION serial_master_compose_identity();

-- 6. Register the AMBIGUOUS_SERIAL rule (raised when a scanned base serial maps
--    to more than one product and no product context was supplied).
ALTER TABLE exception_log DROP CONSTRAINT IF EXISTS exception_log_rule_code_check;
ALTER TABLE exception_log
  ADD CONSTRAINT exception_log_rule_code_check CHECK (rule_code IN (
    'MALFORMED_SERIAL',
    'ALREADY_DISPATCHED',
    'DISPATCH_QUANTITY_REACHED',
    'WRONG_WAREHOUSE',
    'NOT_FOUND',
    'PRODUCT_INVOICE_MISMATCH',
    'SHORT',
    'EXCESS',
    'WRONG_SERIAL',
    'UNKNOWN_PRODUCT',
    'DUPLICATE_SERIAL',
    'DUPLICATE_SCAN',
    'IMPORT_FAILED',
    'NO_ORIGINAL_DISPATCH',
    'ALREADY_RETURNED',
    'INVALID_CONDITION_TAG',
    'WRONG_INVOICE_SERIAL',
    'BATTERY_NOT_PREBILLED',
    'CONDITION_HOLD',
    'AMBIGUOUS_SERIAL'
  ));

-- 7. Recreate the ageing_serial_snapshot materialized view dropped in step 1.
--    Definition kept verbatim from V004__ageing_reconciliation.sql. It is created
--    unpopulated-then-populated by CREATE MATERIALIZED VIEW (no WITH NO DATA), so
--    it holds the newly composed serial_no values immediately.
CREATE MATERIALIZED VIEW IF NOT EXISTS ageing_serial_snapshot AS
SELECT
    s.serial_id,
    s.serial_no,
    s.product_id,
    s.current_warehouse_id AS warehouse_id,
    s.current_status,
    s.received_at,
    CASE
        WHEN s.received_at IS NULL THEN NULL
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - s.received_at)) / 86400)::int)
    END AS age_days,
    (s.received_at IS NULL) AS missing_received_at,
    now() AS snapshot_at
FROM serial_master s
WHERE s.current_status = 'IN_STOCK';

CREATE INDEX IF NOT EXISTS ix_ageing_snapshot_wh_product
ON ageing_serial_snapshot(warehouse_id, product_id, age_days);

CREATE INDEX IF NOT EXISTS ix_ageing_snapshot_missing_received
ON ageing_serial_snapshot(missing_received_at, warehouse_id);
