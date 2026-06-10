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
  test("includes available warehouse serial numbers for each invoice line", async () => {
    const { repository, calls } = createRepository();

    const lines = await repository.invoiceLines([10]);

    expect(calls[0].sql).toContain("JOIN invoice i ON i.invoice_id = il.invoice_id");
    expect(calls[0].sql).toContain("serial_master");
    expect(calls[0].sql).toContain("sm.current_warehouse_id = i.warehouse_id");
    expect(calls[0].sql).toContain("sm.current_status = 'IN_STOCK'");
    expect(lines[0].serialNos).toEqual(["SN-001", "SN-002"]);
  });
});
