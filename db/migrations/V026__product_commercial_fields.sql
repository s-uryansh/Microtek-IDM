-- Replace the fixed 4-value category enum with the client's own free-form
-- category codes (their real export uses codes like 'PSD' that don't fit
-- INVERTER/BATTERY/SOLAR/ACCESSORY), and add the client's commercial fields.
ALTER TABLE product DROP CONSTRAINT IF EXISTS product_category_check;
ALTER TABLE product ALTER COLUMN category TYPE VARCHAR(60);

ALTER TABLE product ADD COLUMN IF NOT EXISTS sub_category VARCHAR(60);
UPDATE product SET sub_category = category WHERE sub_category IS NULL;
ALTER TABLE product ALTER COLUMN sub_category SET NOT NULL;

ALTER TABLE product ADD COLUMN IF NOT EXISTS product_category VARCHAR(60);
ALTER TABLE product ADD COLUMN IF NOT EXISTS distributor_price NUMERIC(12,2);
ALTER TABLE product ADD COLUMN IF NOT EXISTS warranty VARCHAR(60);
ALTER TABLE product ADD COLUMN IF NOT EXISTS gst NUMERIC(5,2);
ALTER TABLE product ADD COLUMN IF NOT EXISTS mrp NUMERIC(12,2);
ALTER TABLE product ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2);
ALTER TABLE product ADD COLUMN IF NOT EXISTS stock INTEGER;
ALTER TABLE product ADD COLUMN IF NOT EXISTS sbu VARCHAR(20);
ALTER TABLE product ADD COLUMN IF NOT EXISTS poll VARCHAR(40);
ALTER TABLE product ADD COLUMN IF NOT EXISTS moq INTEGER;
ALTER TABLE product ADD COLUMN IF NOT EXISTS description TEXT;
