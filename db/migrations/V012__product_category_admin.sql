ALTER TABLE product
  ADD COLUMN IF NOT EXISTS category VARCHAR(40);

UPDATE product SET category = segment WHERE category IS NULL;

ALTER TABLE product
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE product
  ADD CONSTRAINT product_category_check CHECK (category IN (
    'INVERTER', 'BATTERY', 'SOLAR', 'ACCESSORY'
  ));
