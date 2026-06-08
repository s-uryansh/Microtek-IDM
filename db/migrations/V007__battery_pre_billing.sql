CREATE TABLE IF NOT EXISTS battery_pre_billing (
    battery_pre_billing_id BIGSERIAL PRIMARY KEY,
    invoice_line_id BIGINT NOT NULL REFERENCES invoice_line(invoice_line_id),
    serial_id BIGINT NOT NULL REFERENCES serial_master(serial_id),
    committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    committed_by VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    UNIQUE (invoice_line_id, serial_id),
    UNIQUE (serial_id)
);

CREATE INDEX IF NOT EXISTS ix_battery_pre_billing_invoice_line
ON battery_pre_billing(invoice_line_id);

CREATE INDEX IF NOT EXISTS ix_battery_pre_billing_serial
ON battery_pre_billing(serial_id);

ALTER TABLE serial_event DROP CONSTRAINT IF EXISTS serial_event_event_type_check;
ALTER TABLE serial_event ADD CONSTRAINT serial_event_event_type_check CHECK (event_type IN (
    'PRODUCTION',
    'FACTORY_DISPATCH',
    'GRN',
    'TRANSFER',
    'CUSTOMER_DISPATCH',
    'SRN',
    'EXCEPTION',
    'CORRECTION',
    'PRE_BILLING'
));
