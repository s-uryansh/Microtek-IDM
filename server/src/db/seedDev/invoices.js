import { createdBy, upsertOne } from "./constants.js";
import { appendEventOnce } from "./serials.js";

async function seedInvoiceRow(client, ref, header, status = "PENDING") {
  return upsertOne(client, `
    INSERT INTO invoice (
      sap_invoice_ref, status,
      order_id, customer_name, customer_code, billing_date, billing_number, division,
      total_sale_qty, item_total, total_amt, transport_name, lr_no, lr_date,
      dispatch_date, delivery_date, sales_order_qty, pod_status,
      invoice_type, source_warehouse_id, destination_warehouse_id, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    ON CONFLICT (sap_invoice_ref) DO UPDATE
    SET status = EXCLUDED.status,
        order_id = EXCLUDED.order_id, customer_name = EXCLUDED.customer_name,
        customer_code = EXCLUDED.customer_code, billing_date = EXCLUDED.billing_date,
        billing_number = EXCLUDED.billing_number, division = EXCLUDED.division,
        total_sale_qty = EXCLUDED.total_sale_qty, item_total = EXCLUDED.item_total,
        total_amt = EXCLUDED.total_amt, transport_name = EXCLUDED.transport_name,
        lr_no = EXCLUDED.lr_no, lr_date = EXCLUDED.lr_date,
        dispatch_date = EXCLUDED.dispatch_date, delivery_date = EXCLUDED.delivery_date,
        sales_order_qty = EXCLUDED.sales_order_qty, pod_status = EXCLUDED.pod_status,
        invoice_type = EXCLUDED.invoice_type,
        source_warehouse_id = EXCLUDED.source_warehouse_id,
        destination_warehouse_id = EXCLUDED.destination_warehouse_id,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_id AS "invoiceId"`,
    [
      ref, status,
      header.orderId ?? null, header.customerName ?? null, header.customerCode ?? null,
      header.billingDate ?? null, header.billingNumber ?? null, header.division ?? null,
      header.totalSaleQty ?? null, header.itemTotal ?? null, header.totalAmt ?? null,
      header.transportName ?? null, header.lrNo ?? null, header.lrDate ?? null,
      header.dispatchDate ?? null, header.deliveryDate ?? null, header.salesOrderQty ?? null,
      header.podStatus ?? null,
      header.invoiceType ?? "CUSTOMER",
      header.sourceWarehouseId ?? null, header.destinationWarehouseId ?? null,
      createdBy
    ]
  );
}

async function seedInvoiceLineRow(client, invoiceId, lineNo, productId, quantity, line = {}) {
  return upsertOne(client, `
    INSERT INTO invoice_line (
      invoice_id, product_id, line_no, required_quantity,
      uom, amount, pod_section, pod_document, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (invoice_id, line_no) DO UPDATE
    SET product_id = EXCLUDED.product_id, required_quantity = EXCLUDED.required_quantity,
        uom = EXCLUDED.uom, amount = EXCLUDED.amount,
        pod_section = EXCLUDED.pod_section, pod_document = EXCLUDED.pod_document,
        updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING invoice_line_id AS "invoiceLineId"`,
    [
      invoiceId, productId, lineNo, quantity,
      line.uom ?? "NOS", line.amount ?? null, line.podSection ?? null, line.podDocument ?? null,
      createdBy
    ]
  );
}

export async function seedInvoicesAndDispatch(client, { warehouses, products, serials }) {
  /* ── Invoice 1: MTK-INVOICE-001, multi-product ── */
  const invoice1 = await seedInvoiceRow(client, "MTK-INVOICE-001", {
    orderId: "SO-2026-0001",
    customerName: "Sunrise Power Solutions",
    customerCode: "CUST-1001",
    billingDate: "2026-05-10",
    billingNumber: "BILL-2026-0001",
    division: "POWER PRODUCTS",
    totalSaleQty: 25,
    itemTotal: 3,
    totalAmt: 455751,
    transportName: "Bluedart Surface",
    lrNo: "LR-558821",
    lrDate: "2026-05-11",
    dispatchDate: "2026-05-11",
    deliveryDate: "2026-05-14",
    salesOrderQty: 25,
    podStatus: "PENDING"
  });
  /* INV-001 lines: 2x Microtek Inverter 1KVA, 1x Microtek Solar Panel 300W */
  /* INV-001 also carries the example item: 2x SMART HYBRID NEW 1075 12V SW (899-95N-1075) */
  const inv1Line1 = await seedInvoiceLineRow(client, invoice1.invoiceId, 1, products["MTK-INVERTER-1KVA"], 2, {
    uom: "NOS",
    amount: 184500,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv1Line2 = await seedInvoiceLineRow(client, invoice1.invoiceId, 2, products["MTK-SOLAR-300W"], 1, {
    uom: "NOS",
    amount: 195300,
    podSection: "SEC-A",
    podDocument: null
  });
  await seedInvoiceLineRow(client, invoice1.invoiceId, 3, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 75951,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 2: MTK-INVOICE-BATTERY-001 → RW-01, battery-only ── */
  const batteryInvoice = await seedInvoiceRow(client, "MTK-INVOICE-BATTERY-001", {
    orderId: "SO-2026-0002",
    customerName: "Greenline Distributors",
    customerCode: "CUST-1002",
    billingDate: "2026-05-12",
    billingNumber: "BILL-2026-0002",
    division: "ENERGY STORAGE",
    totalSaleQty: 10,
    itemTotal: 1,
    totalAmt: 128000,
    transportName: "VRL Logistics",
    lrNo: "LR-558840",
    lrDate: "2026-05-13",
    dispatchDate: "2026-05-13",
    deliveryDate: "2026-05-16",
    salesOrderQty: 10,
    podStatus: "PENDING"
  });
  const batteryLine = await seedInvoiceLineRow(client, batteryInvoice.invoiceId, 1, products["MTK-BATTERY-100AH"], 2, {
    uom: "NOS",
    amount: 128000,
    podSection: "SEC-A",
    podDocument: null
  });

  /* ── Invoice 3: MTK-INVOICE-RETURN-001 → RW-01, dispatched (for SRN tests) ── */
  const returnInvoice = await seedInvoiceRow(client, "MTK-INVOICE-RETURN-001", {
    orderId: "SO-2026-0003",
    customerName: "Metro Electricals",
    customerCode: "CUST-1003",
    billingDate: "2026-03-20",
    billingNumber: "BILL-2026-0003",
    division: "POWER PRODUCTS",
    totalSaleQty: 10,
    itemTotal: 1,
    totalAmt: 369000,
    transportName: "Gati KWE",
    lrNo: "LR-557210",
    lrDate: "2026-03-21",
    dispatchDate: "2026-03-21",
    deliveryDate: "2026-03-24",
    salesOrderQty: 10,
    podStatus: "RECEIVED"
  }, "DISPATCHED");
  const returnLine = await seedInvoiceLineRow(client, returnInvoice.invoiceId, 1, products["MTK-INVERTER-1KVA"], 2, {
    uom: "NOS",
    amount: 369000,
    podSection: "SEC-A",
    podDocument: "POD-557210.pdf"
  });

  /* Create a dispatched dispatch + scan for the return invoice */
  const dispatch = await upsertOne(client, `
    INSERT INTO dispatch (invoice_id, warehouse_id, status, created_by)
    VALUES ($1, $2, 'DISPATCHED', $3)
    ON CONFLICT (invoice_id) DO UPDATE
    SET status = 'DISPATCHED', updated_at = now(), updated_by = EXCLUDED.created_by
    RETURNING dispatch_id AS "dispatchId"`,
    [returnInvoice.invoiceId, warehouses["RW-01"], createdBy]
  );
  for (const serialNo of [
    "MTK-RET-0001",
    "MTK-RET-0002"
  ]) {
    await client.query(`
      INSERT INTO dispatch_scan (dispatch_id, invoice_line_id, serial_id, scanned_by, created_by)
      VALUES ($1, $2, $3, 'seed_operator', $4)
      ON CONFLICT DO NOTHING`,
      [dispatch.dispatchId, returnLine.invoiceLineId, serials[serialNo], createdBy]
    );
    await appendEventOnce(client, {
      serialId: serials[serialNo],
      eventType: "CUSTOMER_DISPATCH",
      warehouseId: warehouses["RW-01"],
      referenceType: "DISPATCH",
      referenceId: dispatch.dispatchId
    });
  }

  /* ── Invoice 4: MTK-INVOICE-002, multi-product ── */
  const invoice2 = await seedInvoiceRow(client, "MTK-INVOICE-002", {
    orderId: "SO-2026-0004",
    customerName: "Coastal Energy Traders",
    customerCode: "CUST-1004",
    billingDate: "2026-05-15",
    billingNumber: "BILL-2026-0004",
    division: "SOLAR & ACCESSORIES",
    totalSaleQty: 10,
    itemTotal: 3,
    totalAmt: 268400,
    transportName: "Safexpress",
    lrNo: "LR-558901",
    lrDate: "2026-05-16",
    dispatchDate: "2026-05-16",
    deliveryDate: "2026-05-19",
    salesOrderQty: 10,
    podStatus: "PENDING"
  });
  /* INV-002 lines: 2x Microtek Inverter 2KVA, 2x Microtek Solar Panel 500W, 1x Microtek Charge Controller */
  const inv2Line1 = await seedInvoiceLineRow(client, invoice2.invoiceId, 1, products["MTK-INVERTER-2KVA"], 2, {
    uom: "NOS",
    amount: 148500,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv2Line2 = await seedInvoiceLineRow(client, invoice2.invoiceId, 2, products["MTK-SOLAR-500W"], 2, {
    uom: "NOS",
    amount: 96000,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv2Line3 = await seedInvoiceLineRow(client, invoice2.invoiceId, 3, products["MTK-CHARGE-CONTROLLER"], 1, {
    uom: "NOS",
    amount: 23900,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 5: MTK-INVOICE-003, SMART HYBRID + standard inverters ── */
  const invoice3 = await seedInvoiceRow(client, "MTK-INVOICE-003", {
    orderId: "SO-2026-0005",
    customerName: "Shakti Energy Solutions",
    customerCode: "CUST-1005",
    billingDate: "2026-05-20",
    billingNumber: "BILL-2026-0005",
    division: "POWER PRODUCTS",
    totalSaleQty: 20,
    itemTotal: 3,
    totalAmt: 625036,
    transportName: "DTDC Surface",
    lrNo: "LR-559012",
    lrDate: "2026-05-21",
    dispatchDate: "2026-05-21",
    deliveryDate: "2026-05-24",
    salesOrderQty: 20,
    podStatus: "PENDING"
  });
  const inv3Line1 = await seedInvoiceLineRow(client, invoice3.invoiceId, 1, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 75951,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv3Line2 = await seedInvoiceLineRow(client, invoice3.invoiceId, 2, products["MTK-INVERTER-1KVA"], 1, {
    uom: "NOS",
    amount: 258300,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv3Line3 = await seedInvoiceLineRow(client, invoice3.invoiceId, 3, products["MTK-BATTERY-150AH"], 2, {
    uom: "NOS",
    amount: 106750,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 6: MTK-INVOICE-004, battery-heavy for fulfilment tests ── */
  const invoice4 = await seedInvoiceRow(client, "MTK-INVOICE-004", {
    orderId: "SO-2026-0006",
    customerName: "Aarav Power Systems",
    customerCode: "CUST-1006",
    billingDate: "2026-05-22",
    billingNumber: "BILL-2026-0006",
    division: "ENERGY STORAGE",
    totalSaleQty: 14,
    itemTotal: 3,
    totalAmt: 458800,
    transportName: "TCI Freight",
    lrNo: "LR-559123",
    lrDate: "2026-05-23",
    dispatchDate: "2026-05-23",
    deliveryDate: "2026-05-27",
    salesOrderQty: 14,
    podStatus: "PENDING"
  });
  const inv4Line1 = await seedInvoiceLineRow(client, invoice4.invoiceId, 1, products["MTK-BATTERY-150AH"], 2, {
    uom: "NOS",
    amount: 128100,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv4Line2 = await seedInvoiceLineRow(client, invoice4.invoiceId, 2, products["MTK-BATTERY-100AH"], 1, {
    uom: "NOS",
    amount: 64000,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv4Line3 = await seedInvoiceLineRow(client, invoice4.invoiceId, 3, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 227853,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 7: MTK-INVOICE-005, solar + inverter + accessories ── */
  const invoice5 = await seedInvoiceRow(client, "MTK-INVOICE-005", {
    orderId: "SO-2026-0007",
    customerName: "Bharat Electricals Ltd",
    customerCode: "CUST-1007",
    billingDate: "2026-05-25",
    billingNumber: "BILL-2026-0007",
    division: "SOLAR & ACCESSORIES",
    totalSaleQty: 12,
    itemTotal: 3,
    totalAmt: 369700,
    transportName: "Om Logistics",
    lrNo: "LR-559234",
    lrDate: "2026-05-26",
    dispatchDate: "2026-05-26",
    deliveryDate: "2026-05-30",
    salesOrderQty: 12,
    podStatus: "PENDING"
  });
  const inv5Line1 = await seedInvoiceLineRow(client, invoice5.invoiceId, 1, products["MTK-SOLAR-300W"], 2, {
    uom: "NOS",
    amount: 195300,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv5Line2 = await seedInvoiceLineRow(client, invoice5.invoiceId, 2, products["MTK-INVERTER-2KVA"], 1, {
    uom: "NOS",
    amount: 198000,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv5Line3 = await seedInvoiceLineRow(client, invoice5.invoiceId, 3, products["MTK-CHARGE-CONTROLLER"], 2, {
    uom: "NOS",
    amount: 14340,
    podSection: "SEC-B",
    podDocument: null
  });

  /* ── Invoice 8: MTK-INVOICE-006, multi-product with SMART HYBRID ── */
  const invoice6 = await seedInvoiceRow(client, "MTK-INVOICE-006", {
    orderId: "SO-2026-0008",
    customerName: "Mumbai Electronics & Controls",
    customerCode: "CUST-1008",
    billingDate: "2026-05-28",
    billingNumber: "BILL-2026-0008",
    division: "POWER PRODUCTS",
    totalSaleQty: 16,
    itemTotal: 3,
    totalAmt: 851249,
    transportName: "Safexpress Plus",
    lrNo: "LR-559345",
    lrDate: "2026-05-29",
    dispatchDate: "2026-05-29",
    deliveryDate: "2026-06-02",
    salesOrderQty: 16,
    podStatus: "PENDING"
  });
  const inv6Line1 = await seedInvoiceLineRow(client, invoice6.invoiceId, 1, products["899-95N-1075"], 2, {
    uom: "NOS",
    amount: 75951,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv6Line2 = await seedInvoiceLineRow(client, invoice6.invoiceId, 2, products["MTK-INVERTER-1KVA"], 1, {
    uom: "NOS",
    amount: 184500,
    podSection: "SEC-A",
    podDocument: null
  });
  const inv6Line3 = await seedInvoiceLineRow(client, invoice6.invoiceId, 3, products["MTK-BATTERY-150AH"], 2, {
    uom: "NOS",
    amount: 64050,
    podSection: "SEC-B",
    podDocument: "POD-559345.pdf"
  });

  /* ── Invoice 9: MTK-INVOICE-TRANSFER-001, TRANSFER RW-01 → RW-02 ──
     Unlike customer invoices, a TRANSFER invoice carries its route: stock
     leaves source_warehouse_id and is received at destination_warehouse_id
     via GRN (V030). Used by warehouse-transfer tests and the transfer panel. */
  const transferInvoice = await seedInvoiceRow(client, "MTK-INVOICE-TRANSFER-001", {
    invoiceType: "TRANSFER",
    sourceWarehouseId: warehouses["RW-01"],
    destinationWarehouseId: warehouses["RW-02"],
    orderId: "STO-2026-0001",
    customerName: "Microtek Regional Warehouse 02",
    customerCode: "RW-02",
    billingDate: "2026-06-01",
    billingNumber: "BILL-2026-0009",
    division: "POWER PRODUCTS",
    totalSaleQty: 3,
    itemTotal: 2,
    totalAmt: 0,
    transportName: "Microtek Fleet",
    lrNo: "LR-559456",
    lrDate: "2026-06-02",
    dispatchDate: "2026-06-02",
    deliveryDate: "2026-06-04",
    salesOrderQty: 3,
    podStatus: "PENDING"
  });
  const transferLine1 = await seedInvoiceLineRow(client, transferInvoice.invoiceId, 1, products["MTK-INVERTER-1KVA"], 2, {
    uom: "NOS",
    amount: null,
    podSection: "SEC-A",
    podDocument: null
  });
  const transferLine2 = await seedInvoiceLineRow(client, transferInvoice.invoiceId, 2, products["MTK-BATTERY-100AH"], 1, {
    uom: "NOS",
    amount: null,
    podSection: "SEC-A",
    podDocument: null
  });

  return {
    invoiceId: invoice1.invoiceId,
    invoiceLineId: inv1Line1.invoiceLineId,
    inv1Line2Id: inv1Line2.invoiceLineId,
    batteryInvoiceId: batteryInvoice.invoiceId,
    batteryInvoiceLineId: batteryLine.invoiceLineId,
    returnInvoiceId: returnInvoice.invoiceId,
    returnInvoiceLineId: returnLine.invoiceLineId,
    returnDispatchId: dispatch.dispatchId,
    invoice2Id: invoice2.invoiceId,
    inv2Line1Id: inv2Line1.invoiceLineId,
    inv2Line2Id: inv2Line2.invoiceLineId,
    inv2Line3Id: inv2Line3.invoiceLineId,
    invoice3Id: invoice3.invoiceId,
    inv3Line1Id: inv3Line1.invoiceLineId,
    inv3Line2Id: inv3Line2.invoiceLineId,
    inv3Line3Id: inv3Line3.invoiceLineId,
    invoice4Id: invoice4.invoiceId,
    inv4Line1Id: inv4Line1.invoiceLineId,
    inv4Line2Id: inv4Line2.invoiceLineId,
    inv4Line3Id: inv4Line3.invoiceLineId,
    invoice5Id: invoice5.invoiceId,
    inv5Line1Id: inv5Line1.invoiceLineId,
    inv5Line2Id: inv5Line2.invoiceLineId,
    inv5Line3Id: inv5Line3.invoiceLineId,
    invoice6Id: invoice6.invoiceId,
    inv6Line1Id: inv6Line1.invoiceLineId,
    inv6Line2Id: inv6Line2.invoiceLineId,
    inv6Line3Id: inv6Line3.invoiceLineId,
    transferInvoiceId: transferInvoice.invoiceId,
    transferLine1Id: transferLine1.invoiceLineId,
    transferLine2Id: transferLine2.invoiceLineId
  };
}
