CREATE INDEX IF NOT EXISTS ix_serial_ageing_report
ON serial_master(current_status, current_warehouse_id, product_id, received_at);

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

CREATE TABLE IF NOT EXISTS opening_stock_reconciliation_run (
    reconciliation_run_id BIGSERIAL PRIMARY KEY,
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(warehouse_id),
    source_ref VARCHAR(80),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT',
        'CALCULATED',
        'APPROVED',
        'REJECTED'
    )),
    run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS ix_opening_recon_run_wh_status
ON opening_stock_reconciliation_run(warehouse_id, status, run_at);

CREATE TABLE IF NOT EXISTS opening_stock_reconciliation_line (
    reconciliation_line_id BIGSERIAL PRIMARY KEY,
    reconciliation_run_id BIGINT NOT NULL REFERENCES opening_stock_reconciliation_run(reconciliation_run_id),
    product_id BIGINT NOT NULL REFERENCES product(product_id),
    sap_quantity INTEGER NOT NULL CHECK (sap_quantity >= 0),
    idm_quantity INTEGER NOT NULL CHECK (idm_quantity >= 0),
    variance_quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    UNIQUE (reconciliation_run_id, product_id)
);

CREATE INDEX IF NOT EXISTS ix_opening_recon_line_run
ON opening_stock_reconciliation_line(reconciliation_run_id);

CREATE INDEX IF NOT EXISTS ix_opening_recon_line_product
ON opening_stock_reconciliation_line(product_id);
