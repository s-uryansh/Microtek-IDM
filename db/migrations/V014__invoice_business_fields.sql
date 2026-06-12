-- Rich SAP invoice header + item fields.
-- All columns are nullable/additive so existing invoices, dispatch flows, and
-- tests keep working. "Uploaded Date" maps to invoice.created_at.

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS order_id        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS customer_name   VARCHAR(160),
  ADD COLUMN IF NOT EXISTS customer_code   VARCHAR(60),
  ADD COLUMN IF NOT EXISTS billing_date    DATE,
  ADD COLUMN IF NOT EXISTS billing_number  VARCHAR(80),
  ADD COLUMN IF NOT EXISTS division        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS total_sale_qty  NUMERIC(14, 3),
  ADD COLUMN IF NOT EXISTS item_total      INTEGER,
  ADD COLUMN IF NOT EXISTS total_amt       NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS transport_name  VARCHAR(160),
  ADD COLUMN IF NOT EXISTS lr_no           VARCHAR(80),
  ADD COLUMN IF NOT EXISTS lr_date         DATE,
  ADD COLUMN IF NOT EXISTS dispatch_date   DATE,
  ADD COLUMN IF NOT EXISTS delivery_date   DATE,
  ADD COLUMN IF NOT EXISTS sales_order_qty NUMERIC(14, 3),
  ADD COLUMN IF NOT EXISTS pod_status      VARCHAR(40);

-- Item-level (invoice_line) fields. S.No. = line_no, Material Name = product.name,
-- Material Code = product.product_code, Bill QTY = required_quantity (already present).
ALTER TABLE invoice_line
  ADD COLUMN IF NOT EXISTS uom          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS amount       NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS pod_section  VARCHAR(80),
  ADD COLUMN IF NOT EXISTS pod_document VARCHAR(255);
