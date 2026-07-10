import { createdBy, upsertOne } from "./constants.js";

export async function seedSerial(client, { serialNo, productId, status, warehouseId, receivedAt, sourceInvoiceRef }) {
  const row = await upsertOne(client, `
    INSERT INTO serial_master (
      serial_no, product_id, batch_no, current_status, current_warehouse_id,
      received_at, source_invoice_ref, created_by
    )
    VALUES ($1, $2, 'MTK-APR2026-BATCH', $3, $4, $5, $6, $7)
    ON CONFLICT (serial_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, current_status = EXCLUDED.current_status,
        current_warehouse_id = EXCLUDED.current_warehouse_id,
        received_at = EXCLUDED.received_at,
        source_invoice_ref = EXCLUDED.source_invoice_ref,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING serial_id AS "serialId"`,
    [serialNo, productId, status, warehouseId ?? null, receivedAt ?? null, sourceInvoiceRef ?? null, createdBy]
  );
  return row.serialId;
}

export async function appendEventOnce(client, { serialId, eventType, warehouseId, referenceType, referenceId }) {
  const existing = await client.query(`
    SELECT 1 FROM serial_event
    WHERE serial_id = $1 AND event_type = $2
      AND COALESCE(reference_type, '') = COALESCE($3, '')
      AND COALESCE(reference_id, 0) = COALESCE($4, 0)
    LIMIT 1`,
    [serialId, eventType, referenceType ?? null, referenceId ?? null]
  );
  if (existing.rowCount > 0) return;

  await client.query(`
    INSERT INTO serial_event (serial_id, event_type, warehouse_id, reference_type, reference_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)`,
    [serialId, eventType, warehouseId ?? null, referenceType ?? null, referenceId ?? null, createdBy]
  );
}

export async function seedProductionAndHistory(client, { warehouses, products }) {
  const serials = {};
  const seedRows = [
    /* GRN test serials (IN_TRANSIT at PLNT-01) */
    ["MTK-INTRANSIT-0001",  "MTK-INVERTER-1KVA", "IN_TRANSIT", warehouses["PLNT-01"], null],
    ["MTK-INTRANSIT-0002",  "MTK-INVERTER-1KVA", "IN_TRANSIT", warehouses["PLNT-01"], null],
    ["MTK-INTRANSIT-RW02-0001","MTK-INVERTER-1KVA", "IN_TRANSIT", warehouses["PLNT-01"], null],

    /* Excess / edge-case */
    ["MTK-EXCESS-0001","MTK-INVERTER-2KVA", "IN_STOCK",   warehouses["RW-01"], "2026-05-15T00:00:00.000Z"],

    /* Dispatch test serials (IN_STOCK at RW-01) */
    ["MTK-INV1K-0001", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-15T00:00:00.000Z"],
    ["MTK-INV1K-0002", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-16T00:00:00.000Z"],
    ["MTK-INV1K-0003", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-17T00:00:00.000Z"],
    ["MTK-INV1K-0004", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-18T00:00:00.000Z"],
    ["MTK-INV1K-0005", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-19T00:00:00.000Z"],
    ["MTK-INV1K-0006", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-20T00:00:00.000Z"],
    ["MTK-INV1K-0007", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-21T00:00:00.000Z"],
    ["MTK-INV1K-0008", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-22T00:00:00.000Z"],
    ["MTK-INV1K-0009", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-23T00:00:00.000Z"],
    ["MTK-INV1K-0010", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-04-24T00:00:00.000Z"],

    /* Battery serials (IN_STOCK at RW-01) */
    ["MTK-BAT100-0001",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-20T00:00:00.000Z"],
    ["MTK-BAT100-0002",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-21T00:00:00.000Z"],
    ["MTK-BAT100-0003",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-22T00:00:00.000Z"],
    ["MTK-BAT100-0004",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-23T00:00:00.000Z"],
    ["MTK-BAT100-0005",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-24T00:00:00.000Z"],
    ["MTK-BAT100-0006",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-25T00:00:00.000Z"],
    ["MTK-BAT100-0007",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-26T00:00:00.000Z"],
    ["MTK-BAT100-0008",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-27T00:00:00.000Z"],
    ["MTK-BAT100-0009",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-28T00:00:00.000Z"],
    ["MTK-BAT100-0010",  "MTK-BATTERY-100AH", "IN_STOCK",   warehouses["RW-01"], "2026-04-29T00:00:00.000Z"],

    /* SRN serials (dispatched on the return invoice — realistic qty of 2) */
    ["MTK-RET-0001",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-15T00:00:00.000Z"],
    ["MTK-RET-0002",  "MTK-INVERTER-1KVA", "DISPATCHED", warehouses["RW-01"], "2026-03-16T00:00:00.000Z"],

    /* Lifecycle serial */
    ["MTK-LIFECYCLE-0001", "MTK-INVERTER-1KVA", "IN_STOCK",   warehouses["RW-01"], "2026-02-15T00:00:00.000Z"],

    /* Ageing serials */
    ["MTK-INV2K-0001",   "MTK-INVERTER-2KVA", "IN_STOCK",   warehouses["RW-02"], "2026-01-01T00:00:00.000Z"],
    ["MTK-INV2K-0002","MTK-INVERTER-2KVA","IN_STOCK",   warehouses["RW-02"], null],

    /* New products: solar & accessory serials */
    ["MTK-SOL300-0001",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["MTK-SOL300-0002",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["MTK-SOL300-0003",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["MTK-SOL300-0004",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["MTK-SOL300-0005",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["MTK-SOL300-0006",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["MTK-SOL300-0007",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["MTK-SOL300-0008",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-08T00:00:00.000Z"],
    ["MTK-SOL300-0009",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["MTK-SOL300-0010",  "MTK-SOLAR-300W", "IN_STOCK",   warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["MTK-SOL500-0001", "MTK-SOLAR-500W", "IN_STOCK",   warehouses["RW-02"], "2026-04-10T00:00:00.000Z"],
    ["MTK-INV2K-0003", "MTK-INVERTER-2KVA", "IN_STOCK",   warehouses["RW-02"], "2026-04-11T00:00:00.000Z"],
    ["MTK-SOL500-0002", "MTK-SOLAR-500W", "IN_STOCK",   warehouses["RW-02"], "2026-04-12T00:00:00.000Z"],
    ["MTK-ACCCHG-0001",  "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-20T00:00:00.000Z"],
    ["MTK-ACCCHG-0002",  "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-21T00:00:00.000Z"],
    ["MTK-ACCCHG-0006", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-22T00:00:00.000Z"],
    ["MTK-ACCCHG-0007", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-23T00:00:00.000Z"],
    ["MTK-ACCCHG-0008", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-24T00:00:00.000Z"],
    ["MTK-ACCCHG-0009", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-25T00:00:00.000Z"],
    ["MTK-ACCCHG-0010", "MTK-CHARGE-CONTROLLER", "IN_STOCK",   warehouses["RW-02"], "2026-05-26T00:00:00.000Z"],

    /* SMART HYBRID NEW 1075 12V SW (899-95N-1075) — IN_STOCK at RW-01 for invoice INV-001 */
    ["SH1075-0001", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["SH1075-0002", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["SH1075-0003", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["SH1075-0004", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["SH1075-0005", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["SH1075-0006", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["SH1075-0007", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["SH1075-0008", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["SH1075-0009", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["SH1075-0010", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["SH1075-0011", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["SH1075-0012", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["SH1075-0013", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["SH1075-0014", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["SH1075-0015", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-08T00:00:00.000Z"],

    /* Additional realistic Microtek serials for new invoices */
    ["SH1075-0016", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["SH1075-0017", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["SH1075-0018", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["SH1075-0019", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["SH1075-0020", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-11T00:00:00.000Z"],
    ["SH1075-0021", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-11T00:00:00.000Z"],
    ["SH1075-0022", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-12T00:00:00.000Z"],
    ["SH1075-0023", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-12T00:00:00.000Z"],
    ["SH1075-0024", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-13T00:00:00.000Z"],
    ["SH1075-0025", "899-95N-1075", "IN_STOCK", warehouses["RW-01"], "2026-05-13T00:00:00.000Z"],
    ["EB100-0001", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["EB100-0002", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-11T00:00:00.000Z"],
    ["EB100-0003", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-12T00:00:00.000Z"],
    ["EB100-0004", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-13T00:00:00.000Z"],
    ["EB100-0005", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["RW-01"], "2026-05-14T00:00:00.000Z"],
    ["EB150-0001", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-01T00:00:00.000Z"],
    ["EB150-0002", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-02T00:00:00.000Z"],
    ["EB150-0003", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-03T00:00:00.000Z"],
    ["EB150-0004", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-04T00:00:00.000Z"],
    ["EB150-0005", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-05T00:00:00.000Z"],
    ["EB150-0006", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-06T00:00:00.000Z"],
    ["EB150-0007", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-07T00:00:00.000Z"],
    ["EB150-0008", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-08T00:00:00.000Z"],
    ["EB150-0009", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-09T00:00:00.000Z"],
    ["EB150-0010", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-01"], "2026-05-10T00:00:00.000Z"],
    ["SP300-0001", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-15T00:00:00.000Z"],
    ["SP300-0002", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-16T00:00:00.000Z"],
    ["SP300-0003", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-17T00:00:00.000Z"],
    ["SP300-0004", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-18T00:00:00.000Z"],
    ["SP300-0005", "MTK-SOLAR-300W", "IN_STOCK", warehouses["RW-02"], "2026-05-19T00:00:00.000Z"],
    ["SP500-0001", "MTK-SOLAR-500W", "IN_STOCK", warehouses["RW-02"], "2026-05-10T00:00:00.000Z"],
    ["SP500-0002", "MTK-SOLAR-500W", "IN_STOCK", warehouses["RW-02"], "2026-05-11T00:00:00.000Z"],
    ["SP500-0003", "MTK-SOLAR-500W", "IN_STOCK", warehouses["RW-02"], "2026-05-12T00:00:00.000Z"],
    ["EM1K-0001", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-20T00:00:00.000Z"],
    ["EM1K-0002", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-21T00:00:00.000Z"],
    ["EM1K-0003", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-22T00:00:00.000Z"],
    ["EM1K-0004", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-23T00:00:00.000Z"],
    ["EM1K-0005", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-24T00:00:00.000Z"],
    ["EM1K-0006", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-25T00:00:00.000Z"],
    ["EM1K-0007", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-26T00:00:00.000Z"],
    ["EM1K-0008", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-27T00:00:00.000Z"],
    ["EM1K-0009", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-28T00:00:00.000Z"],
    ["EM1K-0010", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["RW-01"], "2026-05-29T00:00:00.000Z"],
    ["EM2K-0001", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-10T00:00:00.000Z"],
    ["EM2K-0002", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-11T00:00:00.000Z"],
    ["EM2K-0003", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-12T00:00:00.000Z"],
    ["EM2K-0004", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-13T00:00:00.000Z"],
    ["EM2K-0005", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-14T00:00:00.000Z"],
    ["EM2K-0006", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-02"], "2026-05-15T00:00:00.000Z"],

    /* Warehouse stock coverage: PLNT-01, CW-01, RW-03 previously had no IN_STOCK serials */
    ["MTK-PLNT-INV1K-0001", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-03T00:00:00.000Z"],
    ["MTK-PLNT-INV1K-0002", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-04T00:00:00.000Z"],
    ["MTK-PLNT-INV1K-0003", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-05T00:00:00.000Z"],
    ["MTK-PLNT-INV1K-0004", "MTK-INVERTER-1KVA", "IN_STOCK", warehouses["PLNT-01"], "2026-07-06T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0001", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-03T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0002", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-04T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0003", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-05T00:00:00.000Z"],
    ["MTK-PLNT-BAT100-0004", "MTK-BATTERY-100AH", "IN_STOCK", warehouses["PLNT-01"], "2026-07-06T00:00:00.000Z"],

    ["MTK-CW01-SOL300-0001", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-05-24T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0002", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-05-29T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0003", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-03T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0004", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-08T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0005", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-13T00:00:00.000Z"],
    ["MTK-CW01-SOL300-0006", "MTK-SOLAR-300W", "IN_STOCK", warehouses["CW-01"], "2026-06-18T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0001", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-05-25T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0002", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-05-30T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0003", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-04T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0004", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-09T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0005", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-14T00:00:00.000Z"],
    ["MTK-CW01-CHGC-0006", "MTK-CHARGE-CONTROLLER", "IN_STOCK", warehouses["CW-01"], "2026-06-19T00:00:00.000Z"],

    ["MTK-RW03-INV2K-0001", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-03-30T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0002", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-04-08T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0003", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-04-17T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0004", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-04-26T00:00:00.000Z"],
    ["MTK-RW03-INV2K-0005", "MTK-INVERTER-2KVA", "IN_STOCK", warehouses["RW-03"], "2026-05-05T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0001", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-01T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0002", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-10T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0003", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-19T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0004", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-04-28T00:00:00.000Z"],
    ["MTK-RW03-BAT150-0005", "MTK-BATTERY-150AH", "IN_STOCK", warehouses["RW-03"], "2026-05-07T00:00:00.000Z"]
  ];

  for (const [serialNo, productCode, status, warehouseId, receivedAt] of seedRows) {
    serials[serialNo] = await seedSerial(client, {
      serialNo,
      productId: products[productCode],
      status,
      warehouseId,
      receivedAt
    });
    await appendEventOnce(client, {
      serialId: serials[serialNo],
      eventType: "PRODUCTION",
      warehouseId: warehouses["PLNT-01"],
      referenceType: "IMPORT",
      referenceId: null
    });
  }

  await appendEventOnce(client, {
    serialId: serials["MTK-LIFECYCLE-0001"],
    eventType: "GRN",
    warehouseId: warehouses["RW-01"],
    referenceType: "GRN",
    referenceId: null
  });

  return serials;
}
