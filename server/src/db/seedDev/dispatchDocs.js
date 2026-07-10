import { createdBy, upsertOne } from "./constants.js";

export async function seedDispatchDocs(client, { warehouses, products, serials }) {
  const cleanDoc = await upsertOne(client, `
    INSERT INTO sap_dispatch_doc (external_ref, source_warehouse_id, destination_warehouse_id, created_by)
    VALUES ('MTK-DISPATCH-CW-01', $1, $2, $3)
    ON CONFLICT (external_ref) DO UPDATE
    SET destination_warehouse_id = EXCLUDED.destination_warehouse_id,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING sap_dispatch_doc_id AS "sapDispatchDocId"`,
    [warehouses["PLNT-01"], warehouses["RW-01"], createdBy]
  );
  const wrongDoc = await upsertOne(client, `
    INSERT INTO sap_dispatch_doc (external_ref, source_warehouse_id, destination_warehouse_id, created_by)
    VALUES ('MTK-DISPATCH-RW02-01', $1, $2, $3)
    ON CONFLICT (external_ref) DO UPDATE
    SET destination_warehouse_id = EXCLUDED.destination_warehouse_id,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING sap_dispatch_doc_id AS "sapDispatchDocId"`,
    [warehouses["PLNT-01"], warehouses["RW-02"], createdBy]
  );

  for (const [docId, serialNo, lineNo] of [
    [cleanDoc.sapDispatchDocId, "MTK-INTRANSIT-0001", 1],
    [cleanDoc.sapDispatchDocId, "MTK-INTRANSIT-0002", 2],
    [wrongDoc.sapDispatchDocId, "MTK-INTRANSIT-RW02-0001", 1]
  ]) {
    await client.query(`
      INSERT INTO sap_dispatch_line (sap_dispatch_doc_id, serial_id, product_id, line_no, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (sap_dispatch_doc_id, serial_id) DO NOTHING`,
      [docId, serials[serialNo], products["MTK-INVERTER-1KVA"], lineNo, createdBy]
    );
  }

  return { cleanDocId: cleanDoc.sapDispatchDocId };
}
