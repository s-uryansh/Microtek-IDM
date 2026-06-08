CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_invoice_once
ON dispatch(invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_scan_serial_once
ON dispatch_scan(serial_id);

CREATE INDEX IF NOT EXISTS ix_dispatch_scan_line_count
ON dispatch_scan(dispatch_id, invoice_line_id);

CREATE INDEX IF NOT EXISTS ix_serial_event_reference
ON serial_event(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS ix_exception_context
ON exception_log(context_type, context_id);
