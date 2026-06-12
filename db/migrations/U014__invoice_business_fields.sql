ALTER TABLE invoice_line
  DROP COLUMN IF EXISTS uom,
  DROP COLUMN IF EXISTS amount,
  DROP COLUMN IF EXISTS pod_section,
  DROP COLUMN IF EXISTS pod_document;

ALTER TABLE invoice
  DROP COLUMN IF EXISTS order_id,
  DROP COLUMN IF EXISTS customer_name,
  DROP COLUMN IF EXISTS customer_code,
  DROP COLUMN IF EXISTS billing_date,
  DROP COLUMN IF EXISTS billing_number,
  DROP COLUMN IF EXISTS division,
  DROP COLUMN IF EXISTS total_sale_qty,
  DROP COLUMN IF EXISTS item_total,
  DROP COLUMN IF EXISTS total_amt,
  DROP COLUMN IF EXISTS transport_name,
  DROP COLUMN IF EXISTS lr_no,
  DROP COLUMN IF EXISTS lr_date,
  DROP COLUMN IF EXISTS dispatch_date,
  DROP COLUMN IF EXISTS delivery_date,
  DROP COLUMN IF EXISTS sales_order_qty,
  DROP COLUMN IF EXISTS pod_status;
