-- Rollback V024.

-- Remove the lifetime one-MATCHED-receipt-per-serial guarantee. The application
-- falls back to the Layer 1 status check + grn_scan(grn_id) duplicate detection.
DROP INDEX IF EXISTS uq_grn_scan_matched_serial;
