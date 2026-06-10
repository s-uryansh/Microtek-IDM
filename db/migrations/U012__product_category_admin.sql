ALTER TABLE product
  DROP CONSTRAINT IF EXISTS product_category_check;

ALTER TABLE product
  DROP COLUMN IF EXISTS category;
