import { describe, expect, test } from "vitest";

import { createAdminRepository } from "../src/admin/adminRepository.js";

function createRepository() {
  const calls = [];
  const repository = createAdminRepository({
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("FROM invoice i")) {
        return {
          rows: [
            {
              invoiceId: 10,
              sapInvoiceRef: "INV-10",
              warehouseId: 3,
              warehouseCode: "RW-01",
              status: "PENDING",
              createdAt: "2026-06-10T00:00:00Z"
            }
          ]
        };
      }

      if (sql.includes("FROM invoice_line il")) {
        return {
          rows: [
            {
              invoiceLineId: 1,
              invoiceId: 10,
              lineNo: 1,
              productId: 7,
              productCode: "MTK-7",
              productName: "Product 7",
              segment: "GENERAL",
              category: "ACCESSORY",
              isBattery: false,
              quantity: 2,
              serialNos: ["SN-001", "SN-002"]
            }
          ]
        };
      }

      return { rows: [] };
    }
  });

  return { repository, calls };
}

describe("admin repository invoice serial aggregation", () => {
  test("shows only dispatched serial numbers for each invoice line", async () => {
    const { repository, calls } = createRepository();

    const lines = await repository.invoiceLines([10]);

    // Serials come exclusively from dispatch_scan — an undispatched invoice
    // shows no serials, and we never surface in-stock serials that were never
    // dispatched.
    expect(calls[0].sql).toContain("dispatch_scan ds");
    expect(calls[0].sql).toContain("ds.invoice_line_id = il.invoice_line_id");
    expect(calls[0].sql).not.toContain("sm.current_status = 'IN_STOCK'");
    expect(calls[0].sql).not.toContain("sm.product_id = il.product_id");
    expect(lines[0].serialNos).toEqual(["SN-001", "SN-002"]);
  });
});

describe("admin repository warehouse stock", () => {
  test("lists every in-stock unit with its product and warehouse", async () => {
    const calls = [];
    const repository = createAdminRepository({
      async query(sql) {
        calls.push({ sql });
        return {
          rows: [
            {
              serialId: 50,
              serialNo: "SN-001",
              serialStatus: "IN_STOCK",
              productId: 7,
              productCode: "MTK-7",
              productName: "Product 7",
              warehouseId: 3,
              warehouseCode: "RW-01",
              warehouseName: "Region West 01"
            }
          ]
        };
      }
    });

    const stock = await repository.listWarehouseStock();

    expect(calls[0].sql).toContain("FROM serial_master sm");
    expect(calls[0].sql).toContain("sm.current_status = 'IN_STOCK'");
    expect(calls[0].sql).toContain("JOIN warehouse w ON w.warehouse_id = sm.current_warehouse_id");
    expect(stock[0]).toMatchObject({
      serialNo: "SN-001",
      productCode: "MTK-7",
      warehouseCode: "RW-01"
    });
  });
});
