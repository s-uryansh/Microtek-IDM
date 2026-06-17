-- Returns hardening + partial dispatch (Findings 1 & 2)
--
-- Finding 1: a returned serial keeps its condition tag on the serial itself so
-- that DEFECTIVE/REPAIR stock cannot be silently dispatched again. SALEABLE (or
-- an untagged, never-returned serial) remains freely dispatchable.
--
-- Finding 2: an invoice can be PARTIALLY_DISPATCHED, and a return re-opens the
-- invoice for the quantity that came back. The original dispatch_scan is marked
-- returned (soft) so it stops counting toward the dispatched quantity while the
-- row is preserved for audit.

-- 1. Serial-level condition tag (mirrors the per-scan srn_scan.condition_tag).
ALTER TABLE serial_master
  ADD COLUMN IF NOT EXISTS condition_tag VARCHAR(16);

ALTER TABLE serial_master
  DROP CONSTRAINT IF EXISTS serial_master_condition_tag_check;
ALTER TABLE serial_master
  ADD CONSTRAINT serial_master_condition_tag_check
  CHECK (condition_tag IS NULL OR condition_tag IN ('SALEABLE', 'DEFECTIVE', 'REPAIR'));

-- Held-stock lookup for the retag screen.
CREATE INDEX IF NOT EXISTS ix_serial_condition_hold
  ON serial_master(current_warehouse_id, condition_tag)
  WHERE condition_tag IN ('DEFECTIVE', 'REPAIR');

-- 2. Invoice partial-dispatch status. IN_PROGRESS is kept so existing rows stay
-- valid; new writes use PARTIALLY_DISPATCHED for the some-but-not-all state.
ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_status_check;
ALTER TABLE invoice
  ADD CONSTRAINT invoice_status_check
  CHECK (status IN ('PENDING', 'IN_PROGRESS', 'PARTIALLY_DISPATCHED', 'DISPATCHED'));

-- 3. Soft-return on dispatch_scan so a returned serial can be re-dispatched and
-- stops counting toward the dispatched quantity.
ALTER TABLE dispatch_scan
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by VARCHAR(60);

ALTER TABLE dispatch_scan
  DROP CONSTRAINT IF EXISTS dispatch_scan_dispatch_id_serial_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_scan_active
  ON dispatch_scan(dispatch_id, serial_id)
  WHERE returned_at IS NULL;

-- 4. Declared return quantity captured by the operator on the SRN header.
ALTER TABLE srn
  ADD COLUMN IF NOT EXISTS expected_quantity INTEGER;
ALTER TABLE srn
  DROP CONSTRAINT IF EXISTS srn_expected_quantity_check;
ALTER TABLE srn
  ADD CONSTRAINT srn_expected_quantity_check
  CHECK (expected_quantity IS NULL OR expected_quantity > 0);

-- 5. New rule code for a dispatch blocked because the serial is on condition hold.
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
    'CONDITION_HOLD'
  ));

-- 6. Seed the condition-correction permission for admin + supervisor.
INSERT INTO role_permission (role_id, permission_code, created_by)
SELECT r.role_id, 'condition:correct', 'V023'
FROM role r
WHERE r.code IN ('admin', 'supervisor')
ON CONFLICT (role_id, permission_code) DO NOTHING;
