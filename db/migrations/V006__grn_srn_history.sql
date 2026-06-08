ALTER TABLE exception_log DROP CONSTRAINT IF EXISTS exception_log_rule_code_check;
ALTER TABLE exception_log ADD CONSTRAINT exception_log_rule_code_check CHECK (rule_code IN (
    'MALFORMED_SERIAL',
    'ALREADY_DISPATCHED',
    'WRONG_WAREHOUSE',
    'NOT_FOUND',
    'PRODUCT_INVOICE_MISMATCH',
    'SHORT',
    'EXCESS',
    'WRONG_SERIAL',
    'DUPLICATE_SERIAL',
    'DUPLICATE_SCAN',
    'UNKNOWN_PRODUCT',
    'IMPORT_FAILED',
    'NO_ORIGINAL_DISPATCH',
    'ALREADY_RETURNED',
    'INVALID_CONDITION_TAG'
));

CREATE TABLE IF NOT EXISTS sap_dispatch_doc (
    sap_dispatch_doc_id BIGSERIAL PRIMARY KEY,
    external_ref VARCHAR(80) NOT NULL UNIQUE,
    source_warehouse_id BIGINT REFERENCES warehouse(warehouse_id),
    destination_warehouse_id BIGINT NOT NULL REFERENCES warehouse(warehouse_id),
    status VARCHAR(24) NOT NULL DEFAULT 'IMPORTED' CHECK (status IN (
        'IMPORTED',
        'GRN_IN_PROGRESS',
        'GRN_CLOSED'
    )),
    batch_id BIGINT REFERENCES integration_batch(batch_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS ix_sap_dispatch_doc_destination_status
ON sap_dispatch_doc(destination_warehouse_id, status);

CREATE TABLE IF NOT EXISTS sap_dispatch_line (
    sap_dispatch_line_id BIGSERIAL PRIMARY KEY,
    sap_dispatch_doc_id BIGINT NOT NULL REFERENCES sap_dispatch_doc(sap_dispatch_doc_id),
    serial_id BIGINT NOT NULL REFERENCES serial_master(serial_id),
    product_id BIGINT NOT NULL REFERENCES product(product_id),
    line_no INTEGER NOT NULL CHECK (line_no > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    UNIQUE (sap_dispatch_doc_id, serial_id),
    UNIQUE (sap_dispatch_doc_id, line_no)
);

CREATE INDEX IF NOT EXISTS ix_sap_dispatch_line_doc_serial
ON sap_dispatch_line(sap_dispatch_doc_id, serial_id);

CREATE INDEX IF NOT EXISTS ix_sap_dispatch_line_serial
ON sap_dispatch_line(serial_id);

CREATE TABLE IF NOT EXISTS grn (
    grn_id BIGSERIAL PRIMARY KEY,
    sap_dispatch_doc_id BIGINT NOT NULL REFERENCES sap_dispatch_doc(sap_dispatch_doc_id),
    receiving_warehouse_id BIGINT NOT NULL REFERENCES warehouse(warehouse_id),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'IN_PROGRESS',
        'MATCHED',
        'EXCEPTION',
        'CLOSED'
    )),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60),
    UNIQUE (sap_dispatch_doc_id)
);

CREATE INDEX IF NOT EXISTS ix_grn_receiving_status
ON grn(receiving_warehouse_id, status);

CREATE TABLE IF NOT EXISTS grn_scan (
    grn_scan_id BIGSERIAL PRIMARY KEY,
    grn_id BIGINT NOT NULL REFERENCES grn(grn_id),
    serial_id BIGINT REFERENCES serial_master(serial_id),
    serial_no VARCHAR(80) NOT NULL,
    match_status VARCHAR(24) NOT NULL CHECK (match_status IN (
        'MATCHED',
        'SHORT',
        'EXCESS',
        'WRONG_SERIAL',
        'DUPLICATE_SCAN'
    )),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scanned_by VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_grn_scan_serial_once
ON grn_scan(grn_id, serial_id)
WHERE serial_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_grn_scan_short_once
ON grn_scan(grn_id, serial_no, match_status)
WHERE match_status = 'SHORT';

CREATE INDEX IF NOT EXISTS ix_grn_scan_status
ON grn_scan(grn_id, match_status);

CREATE INDEX IF NOT EXISTS ix_grn_scan_serial
ON grn_scan(serial_id);

CREATE TABLE IF NOT EXISTS srn (
    srn_id BIGSERIAL PRIMARY KEY,
    receiving_warehouse_id BIGINT NOT NULL REFERENCES warehouse(warehouse_id),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'IN_PROGRESS',
        'CLOSED',
        'EXCEPTION'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS ix_srn_receiving_status
ON srn(receiving_warehouse_id, status);

CREATE TABLE IF NOT EXISTS srn_scan (
    srn_scan_id BIGSERIAL PRIMARY KEY,
    srn_id BIGINT NOT NULL REFERENCES srn(srn_id),
    serial_id BIGINT NOT NULL REFERENCES serial_master(serial_id),
    original_dispatch_scan_id BIGINT REFERENCES dispatch_scan(dispatch_scan_id),
    condition_tag VARCHAR(40) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACCEPTED' CHECK (status IN (
        'ACCEPTED',
        'EXCEPTION'
    )),
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scanned_by VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    UNIQUE (srn_id, serial_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_srn_scan_serial_once
ON srn_scan(serial_id);

CREATE INDEX IF NOT EXISTS ix_srn_scan_srn
ON srn_scan(srn_id);

CREATE INDEX IF NOT EXISTS ix_serial_event_timeline
ON serial_event(serial_id, event_at, event_id);

CREATE INDEX IF NOT EXISTS ix_exception_serial_context
ON exception_log(serial_no, context_type, context_id, raised_at);
