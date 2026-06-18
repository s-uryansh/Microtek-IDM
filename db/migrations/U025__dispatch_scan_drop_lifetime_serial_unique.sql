-- Rollback V025: restore the V005 lifetime one-dispatch-per-serial index.
-- NOTE: this re-introduces the bug where a returned serial cannot be
-- re-dispatched; only roll back if also reverting the returns/re-dispatch flow.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_scan_serial_once
ON dispatch_scan(serial_id);
