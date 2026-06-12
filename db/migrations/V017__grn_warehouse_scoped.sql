-- GRN is now warehouse-scoped: staff receive stock into their warehouse and scan
-- serials directly, instead of starting against one SAP dispatch document. The
-- dispatch-document link becomes optional and is no longer unique per GRN.
ALTER TABLE grn ALTER COLUMN sap_dispatch_doc_id DROP NOT NULL;
ALTER TABLE grn DROP CONSTRAINT IF EXISTS grn_sap_dispatch_doc_id_key;
