import { createdBy } from "./constants.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

export async function q(client, sql, values = []) {
  return (await client.query(sql, values)).rows;
}

export async function q1(client, sql, values = []) {
  return (await q(client, sql, values))[0];
}

export async function insertSerial(client, serialNo, productId, status, warehouseId, receivedAt, batchId) {
  const row = await q1(client,
    `INSERT INTO serial_master (serial_no, product_id, current_status, current_warehouse_id, received_at, batch_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (serial_no) DO UPDATE SET
       current_status=EXCLUDED.current_status, current_warehouse_id=EXCLUDED.current_warehouse_id,
       received_at=EXCLUDED.received_at, batch_id=EXCLUDED.batch_id,
       updated_at=now(), updated_by=EXCLUDED.created_by
     RETURNING serial_id`,
    [serialNo, productId, status, warehouseId, receivedAt, batchId, createdBy]
  );
  return Number(row.serial_id);
}

export async function insertEvent(client, serialId, eventType, warehouseId, refType, refId, batchId, eventAt = null) {
  await client.query(
    `INSERT INTO serial_event (serial_id, event_type, warehouse_id, reference_type, reference_id, batch_id, event_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now()),$8)`,
    [serialId, eventType, warehouseId, refType, refId, batchId, eventAt, createdBy]
  );
}
