import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { createInvoiceRepository } from "../src/db/invoiceRepository.js";
import { createSerialRepository } from "../src/db/serialRepository.js";
import { createDispatchRepository } from "../src/db/dispatchRepository.js";
import { createSapDispatchRepository } from "../src/db/sapDispatchRepository.js";

function readRepository(fileName) {
  return readFileSync(resolve(`src/db/${fileName}`), "utf8");
}

describe("business module repository SQL contracts", () => {
  test("GRN repository uses parameterized queries and idempotent scan insertion", () => {
    const sql = readRepository("grnRepository.js");

    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("$1");
    expect(sql).toContain("$2::varchar");
  });

  test("SRN repository protects duplicate returns with parameterized insert", () => {
    const sql = readRepository("srnRepository.js");

    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("FROM srn_scan WHERE serial_id = $1");
    expect(sql).toContain("FOR UPDATE");
  });

  test("dispatch repository casts status parameter used in CASE expression", () => {
    const sql = readRepository("dispatchRepository.js");

    expect(sql).toContain("$2::varchar = 'DISPATCHED'");
  });

  test("serial history repository orders event and exception lookups chronologically", () => {
    const sql = readRepository("serialHistoryRepository.js");

    expect(sql).toContain("ORDER BY event_at, event_id");
    expect(sql).toContain("ORDER BY raised_at, exception_id");
    expect(sql).toContain("WHERE serial_no = $1");
  });

  test("invoice repository normalizes numeric IDs returned from PostgreSQL", async () => {
    const repository = createInvoiceRepository({
      async query() {
        return {
          rows: [{
            invoiceLineId: "2",
            invoiceId: "2",
            productId: "3",
            quantity: "2",
            isBattery: true
          }]
        };
      }
    });

    const line = await repository.findLineById(2);

    expect(line).toMatchObject({
      invoiceLineId: 2,
      invoiceId: 2,
      productId: 3,
      quantity: 2
    });
  });

  test("serial repository normalizes numeric IDs returned from PostgreSQL", async () => {
    const repository = createSerialRepository({
      async query() {
        return {
          rows: [{
            serialId: "7",
            serialNo: "MTK-BAT100-0001",
            productId: "3",
            currentStatus: "IN_STOCK",
            currentWarehouseId: "3"
          }]
        };
      }
    });

    const serial = await repository.findBySerialNo("MTK-BAT100-0001");

    expect(serial).toMatchObject({
      serialId: 7,
      productId: 3,
      currentWarehouseId: 3
    });
  });

  test("dispatch repository normalizes numeric IDs returned from PostgreSQL", async () => {
    const repository = createDispatchRepository({
      async query(sql) {
        if (sql.includes("FROM dispatch_scan")) {
          return {
            rows: [{
              dispatchScanId: "8",
              invoiceLineId: "1",
              serialId: "6"
            }]
          };
        }
        if (sql.includes("FROM invoice_line")) {
          return {
            rows: [{
              invoiceLineId: "1",
              productId: "1",
              quantity: "2"
            }]
          };
        }
        return {
          rows: [{
            dispatchId: "2",
            invoiceId: "1",
            warehouseId: "3",
            status: "PENDING"
          }]
        };
      }
    });

    const dispatch = await repository.findById(2);

    expect(dispatch).toMatchObject({
      dispatchId: 2,
      invoiceId: 1,
      warehouseId: 3,
      lines: [{ invoiceLineId: 1, productId: 1, quantity: 2 }],
      scans: [{ dispatchScanId: 8, invoiceLineId: 1, serialId: 6 }]
    });
  });

  test("SAP dispatch lookup flags a serial that maps to multiple dispatch docs", async () => {
    const repository = createSapDispatchRepository({
      async query() {
        return {
          rows: [
            { sapDispatchDocId: "12", serialId: "44", destinationWarehouseId: "3" },
            { sapDispatchDocId: "9", serialId: "44", destinationWarehouseId: "5" }
          ]
        };
      }
    });

    const dispatch = await repository.findBySerialId(44);

    // Returns the newest doc (ordered created_at DESC) but flags the ambiguity
    // rather than silently hiding the second owner.
    expect(dispatch.sapDispatchDocId).toBe(12);
    expect(dispatch.ambiguous).toBe(true);
    expect(dispatch.candidateDispatchDocIds).toEqual([12, 9]);
  });

  test("SAP dispatch lookup is unambiguous for a single owner and null when unknown", async () => {
    const single = createSapDispatchRepository({
      async query() {
        return { rows: [{ sapDispatchDocId: "12", serialId: "44", destinationWarehouseId: "3" }] };
      }
    });
    const missing = createSapDispatchRepository({
      async query() {
        return { rows: [] };
      }
    });

    expect(await single.findBySerialId(44)).toMatchObject({ sapDispatchDocId: 12, ambiguous: false });
    expect(await missing.findBySerialId(99)).toBeNull();
  });
});
