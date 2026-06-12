-- Reverse: restore the single-document GRN constraints. Will fail if any
-- warehouse-scoped (NULL document) GRNs exist; remove those first.
ALTER TABLE grn ADD CONSTRAINT grn_sap_dispatch_doc_id_key UNIQUE (sap_dispatch_doc_id);
ALTER TABLE grn ALTER COLUMN sap_dispatch_doc_id SET NOT NULL;
