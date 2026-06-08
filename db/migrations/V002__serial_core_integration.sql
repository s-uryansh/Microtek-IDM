CREATE TABLE IF NOT EXISTS integration_batch (
    batch_id BIGSERIAL PRIMARY KEY,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
    payload_type VARCHAR(30) NOT NULL CHECK (payload_type IN (
        'PRODUCTION',
        'FACTORY_DISPATCH',
        'INVOICE',
        'CONFIRMED_SERIALS',
        'AGEING'
    )),
    external_ref VARCHAR(80) NOT NULL,
    source_system VARCHAR(60) NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'PROCESSED',
        'FAILED',
        'REPLAYED'
    )),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    error_detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60),
    UNIQUE (direction, payload_type, external_ref)
);

CREATE TABLE IF NOT EXISTS serial_master (
    serial_id BIGSERIAL PRIMARY KEY,
    serial_no VARCHAR(80) NOT NULL UNIQUE,
    product_id BIGINT NOT NULL REFERENCES product(product_id),
    batch_no VARCHAR(60),
    current_status VARCHAR(24) NOT NULL DEFAULT 'PRODUCED' CHECK (current_status IN (
        'PRODUCED',
        'IN_TRANSIT',
        'IN_STOCK',
        'DISPATCHED',
        'RETURNED',
        'EXCEPTION'
    )),
    current_warehouse_id BIGINT REFERENCES warehouse(warehouse_id),
    received_at TIMESTAMPTZ,
    source_invoice_ref VARCHAR(60),
    batch_id BIGINT REFERENCES integration_batch(batch_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS ix_serial_status_wh ON serial_master(current_status, current_warehouse_id);
CREATE INDEX IF NOT EXISTS ix_serial_product ON serial_master(product_id);
CREATE INDEX IF NOT EXISTS ix_serial_batch ON serial_master(batch_id);

CREATE TABLE IF NOT EXISTS serial_event (
    event_id BIGSERIAL PRIMARY KEY,
    serial_id BIGINT NOT NULL REFERENCES serial_master(serial_id),
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'PRODUCTION',
        'FACTORY_DISPATCH',
        'GRN',
        'TRANSFER',
        'CUSTOMER_DISPATCH',
        'SRN',
        'EXCEPTION',
        'CORRECTION'
    )),
    warehouse_id BIGINT REFERENCES warehouse(warehouse_id),
    reference_type VARCHAR(20),
    reference_id BIGINT,
    batch_id BIGINT REFERENCES integration_batch(batch_id),
    event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_event_serial_time ON serial_event(serial_id, event_at);
CREATE INDEX IF NOT EXISTS ix_event_batch ON serial_event(batch_id);

CREATE TABLE IF NOT EXISTS exception_log (
    exception_id BIGSERIAL PRIMARY KEY,
    serial_no VARCHAR(80),
    rule_code VARCHAR(40) NOT NULL CHECK (rule_code IN (
        'MALFORMED_SERIAL',
        'ALREADY_DISPATCHED',
        'WRONG_WAREHOUSE',
        'NOT_FOUND',
        'PRODUCT_INVOICE_MISMATCH',
        'SHORT',
        'EXCESS',
        'WRONG_SERIAL',
        'UNKNOWN_PRODUCT',
        'DUPLICATE_SERIAL',
        'IMPORT_FAILED'
    )),
    context_type VARCHAR(20) NOT NULL CHECK (context_type IN (
        'FOUNDATION',
        'IMPORT',
        'GRN',
        'DISPATCH',
        'SRN',
        'BATTERY'
    )),
    context_id BIGINT,
    batch_id BIGINT REFERENCES integration_batch(batch_id),
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CORRECTED','DISMISSED')),
    raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    raised_by VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    corrected_at TIMESTAMPTZ,
    corrected_by VARCHAR(60),
    correction_reason TEXT,
    correction_txn_ref VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS ix_exception_status ON exception_log(status, raised_at);
CREATE INDEX IF NOT EXISTS ix_exception_batch ON exception_log(batch_id);
CREATE INDEX IF NOT EXISTS ix_exception_rule ON exception_log(rule_code, raised_at);
