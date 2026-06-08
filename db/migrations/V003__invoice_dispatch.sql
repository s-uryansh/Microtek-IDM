CREATE TABLE IF NOT EXISTS invoice (
    invoice_id BIGSERIAL PRIMARY KEY,
    sap_invoice_ref VARCHAR(80) NOT NULL UNIQUE,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(warehouse_id),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'IN_PROGRESS',
        'DISPATCHED'
    )),
    sap_outbound_batch_id BIGINT REFERENCES integration_batch(batch_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS ix_invoice_warehouse_status ON invoice(warehouse_id, status);
CREATE INDEX IF NOT EXISTS ix_invoice_sap_outbound_batch ON invoice(sap_outbound_batch_id);

CREATE TABLE IF NOT EXISTS invoice_line (
    invoice_line_id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoice(invoice_id),
    product_id BIGINT NOT NULL REFERENCES product(product_id),
    line_no INTEGER NOT NULL CHECK (line_no > 0),
    required_quantity INTEGER NOT NULL CHECK (required_quantity > 0),
    sap_suggested_serial_no VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60),
    UNIQUE (invoice_id, line_no)
);

CREATE INDEX IF NOT EXISTS ix_invoice_line_invoice ON invoice_line(invoice_id);
CREATE INDEX IF NOT EXISTS ix_invoice_line_product ON invoice_line(product_id);

CREATE TABLE IF NOT EXISTS dispatch (
    dispatch_id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoice(invoice_id),
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(warehouse_id),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'IN_PROGRESS',
        'DISPATCHED'
    )),
    sap_outbound_batch_id BIGINT REFERENCES integration_batch(batch_id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS ix_dispatch_invoice ON dispatch(invoice_id);
CREATE INDEX IF NOT EXISTS ix_dispatch_warehouse_status ON dispatch(warehouse_id, status);
CREATE INDEX IF NOT EXISTS ix_dispatch_sap_outbound_batch ON dispatch(sap_outbound_batch_id);

CREATE TABLE IF NOT EXISTS dispatch_scan (
    dispatch_scan_id BIGSERIAL PRIMARY KEY,
    dispatch_id BIGINT NOT NULL REFERENCES dispatch(dispatch_id),
    invoice_line_id BIGINT NOT NULL REFERENCES invoice_line(invoice_line_id),
    serial_id BIGINT NOT NULL REFERENCES serial_master(serial_id),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scanned_by VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    UNIQUE (dispatch_id, serial_id)
);

CREATE INDEX IF NOT EXISTS ix_dispatch_scan_dispatch ON dispatch_scan(dispatch_id);
CREATE INDEX IF NOT EXISTS ix_dispatch_scan_invoice_line ON dispatch_scan(invoice_line_id);
CREATE INDEX IF NOT EXISTS ix_dispatch_scan_serial ON dispatch_scan(serial_id);
