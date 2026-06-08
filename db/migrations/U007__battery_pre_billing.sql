DROP TABLE IF EXISTS battery_pre_billing;

ALTER TABLE serial_event DROP CONSTRAINT IF EXISTS serial_event_event_type_check;
ALTER TABLE serial_event ADD CONSTRAINT serial_event_event_type_check CHECK (event_type IN (
    'PRODUCTION',
    'FACTORY_DISPATCH',
    'GRN',
    'TRANSFER',
    'CUSTOMER_DISPATCH',
    'SRN',
    'EXCEPTION',
    'CORRECTION'
));
