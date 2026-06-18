-- Duplicate-receipt hardening (IDM-01).
--
-- Bug: scanReceipt creates a fresh, warehouse-scoped GRN on every call (V017),
-- and the duplicate check was scoped to that new grn_id, so the same serial
-- could be received again in a later session — confirmed by reproduction.
--
-- Fix (Layer 2 / race-safe backstop): enforce in the database that a serial can
-- be successfully (MATCHED) received via a factory GRN exactly once over its
-- lifetime. Returns / repair / refurbishment re-enter through srn_scan, a
-- separate bounded context, so a lifetime-unique grn_scan key does not block
-- legitimate reverse logistics. (Decision: lifetime UNIQUE(serial_id). If the
-- business later confirms a serial can appear in two SAP dispatch docs, this
-- must move to a dispatch-scoped key, which first needs sap_dispatch_doc_id
-- restored onto grn_scan.)
--
-- The application also short-circuits on serial.current_status = 'IN_STOCK'
-- (Layer 1, no extra query) and treats an ON CONFLICT DO NOTHING no-op insert as
-- DUPLICATE_SCAN. This index is the guarantee that covers BOTH scan entry points
-- (idm01 scanReceipt and idm02 grnService.scanSerial), not just the app check.

-- Guard: a UNIQUE index cannot be built while duplicate MATCHED receipts already
-- exist. Fail loudly with a count rather than emitting an opaque index error or
-- silently mutating audit rows. Resolve the listed serials, then re-run.
DO $$
DECLARE
  dup_serials INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_serials FROM (
    SELECT serial_id
    FROM grn_scan
    WHERE match_status = 'MATCHED'
      AND serial_id IS NOT NULL
    GROUP BY serial_id
    HAVING COUNT(*) > 1
  ) d;

  IF dup_serials > 0 THEN
    RAISE EXCEPTION
      'V024: % serial(s) already have multiple MATCHED grn_scan rows. Resolve these duplicate receipts before applying (see: SELECT serial_id, COUNT(*) FROM grn_scan WHERE match_status = ''MATCHED'' GROUP BY serial_id HAVING COUNT(*) > 1).',
      dup_serials;
  END IF;
END $$;

-- One MATCHED factory receipt per serial, lifetime. Partial so non-matched scans
-- (SHORT/EXCESS/WRONG_SERIAL/etc.) and NULL serial_id rows are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grn_scan_matched_serial
  ON grn_scan (serial_id)
  WHERE match_status = 'MATCHED';
