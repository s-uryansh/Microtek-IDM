-- Per-line dispatch targets. When an operator chooses how many units of each
-- invoice item to dispatch, one row per chosen invoice line is stored here and the
-- scan flow enforces that cap per line. Invoices dispatched the legacy way (single
-- total quantity, no line selection) simply have no rows here.
CREATE TABLE IF NOT EXISTS dispatch_line (
    dispatch_line_id BIGSERIAL PRIMARY KEY,
    dispatch_id BIGINT NOT NULL REFERENCES dispatch(dispatch_id),
    invoice_line_id BIGINT NOT NULL REFERENCES invoice_line(invoice_line_id),
    target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60),
    UNIQUE (dispatch_id, invoice_line_id)
);

CREATE INDEX IF NOT EXISTS ix_dispatch_line_dispatch ON dispatch_line(dispatch_id);
CREATE INDEX IF NOT EXISTS ix_dispatch_line_invoice_line ON dispatch_line(invoice_line_id);
