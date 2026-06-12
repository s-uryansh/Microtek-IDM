import { ageingReportSchema } from "../models/ageingSchemas.js";
import { sanitizeCsvCell } from "../utils/sanitizeCsvCell.js";

function addToSummary(summaryByBucket, bucket) {
  const existing = summaryByBucket.get(bucket.code);

  if (existing) {
    existing.quantity += 1;
    return;
  }

  summaryByBucket.set(bucket.code, {
    bucketCode: bucket.code,
    label: bucket.label,
    quantity: 1
  });
}

const BUCKET_RANGES = {
  "B0_30":       { minDays: 0,  maxDays: 30 },
  "B31_60":      { minDays: 31, maxDays: 60 },
  "B61_90":      { minDays: 61, maxDays: 90 },
  "B91_PLUS":    { minDays: 91, maxDays: null },
  // "MISSING_RECEIVED_AT": { minDays: null, maxDays: null }
};

export function createAgeingReportService({ repositories, bucketService }) {
  return {
    async getAgeingReport(filters) {
      const parsed = ageingReportSchema.parse(filters);
      const result = await repositories.ageingReports.findOnHandSerials(parsed);
      const rows = Array.isArray(result) ? result : result.rows;
      const total = Array.isArray(result) ? result.length : result.total;
      const summaryByBucket = new Map();
      let missingReceivedAtCount = 0;
      const data = [];

      for (const row of rows) {
        const bucket = bucketService.bucketForAgeDays(row.missingReceivedAt ? null : row.ageDays);

        if (bucket.code === "MISSING_RECEIVED_AT") {
          missingReceivedAtCount += 1;
        }

        addToSummary(summaryByBucket, bucket);
        data.push({
          ...row,
          bucketCode: bucket.code,
          bucketLabel: bucket.label
        });
      }

      return {
        filters: {
          warehouseIds: parsed.warehouseIds,
          productId: parsed.productId
        },
        summary: Array.from(summaryByBucket.values()),
        dataQuality: {
          missingReceivedAtCount
        },
        data,
        pagination: {
          limit: parsed.limit,
          offset: parsed.offset,
          total
        }
      };
    },

    async getExportRows({ warehouseIds = [], limit = 1000, offset = 0 }) {
      // findSerialsForExport scopes to ANY(warehouseIds); an empty array means
      // "all warehouses" and is only ever passed for admins (see resolveScope).
      const result = await repositories.ageingReports.findSerialsForExport({ warehouseIds, limit, offset });

      const rows = result.rows.map((row) => {
        const bucket = bucketService.bucketForAgeDays(row.missingReceivedAt ? null : row.ageDays);
        return {
          serialNo: row.serialNo,
          productCode: row.productCode,
          warehouseId: row.warehouseId,
          receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
          ageDays: row.ageDays,
          bucket: bucket.label
        };
      });

      return { rows, total: result.total };
    },

    async getSapExportRows({ warehouseIds = [], limit = 1000, offset = 0 }) {
      const result = await repositories.ageingReports.findSerialsForExport({ warehouseIds, limit, offset });

      const rows = result.rows.map((row) => {
        const bucket = bucketService.bucketForAgeDays(row.missingReceivedAt ? null : row.ageDays);
        return {
          SERIAL_NO: row.serialNo,
          MATNR: row.productCode,
          LGORT: row.warehouseId,
          WADAT: row.receivedAt ? row.receivedAt.toISOString() : null,
          AGE_DAYS: row.ageDays,
          BUCKET: bucket.label
        };
      });

      return { rows, total: result.total };
    },

    async getProductsInBucket({ warehouseId, bucketCode }) {
      const range = BUCKET_RANGES[bucketCode];
      if (!range) {
        throw Object.assign(new Error(`Unknown bucket: ${bucketCode}`), { status: 400 });
      }

      return repositories.ageingReports.findProductsInBucket({
        warehouseId,
        minAgeDays: range.minDays,
        maxAgeDays: range.maxDays
      });
    },

    async getCsvExport({ warehouseIds = [], limit = 1000, offset = 0 }) {
      const { rows } = await this.getExportRows({ warehouseIds, limit, offset });

      const headers = ["serial_no", "product_code", "warehouse_id", "received_at", "age_days", "bucket"];
      const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(",");
      const bodyLines = rows.map((row) =>
        headers.map((h) => sanitizeCsvCell(row[h === "serial_no" ? "serialNo" : h === "product_code" ? "productCode" : h === "warehouse_id" ? "warehouseId" : h === "received_at" ? "receivedAt" : h === "age_days" ? "ageDays" : h])).join(",")
      );

      return [headerLine, ...bodyLines].join("\n");
    },

    async getSummary({ warehouseIds = [] } = {}) {
      // Empty array means "all warehouses" (admins only); non-admins always
      // arrive here scoped to their assigned warehouses.
      const rows = await repositories.ageingReports.findSummaryByWarehouse({ warehouseIds });
      const summaryByWarehouse = new Map();

      for (const row of rows) {
        if (!summaryByWarehouse.has(row.warehouseId)) {
          summaryByWarehouse.set(row.warehouseId, {
            warehouseId: row.warehouseId,
            warehouseCode: row.warehouseCode,
            buckets: {},
            total: 0
          });
        }

        const entry = summaryByWarehouse.get(row.warehouseId);
        const bucket = bucketService.bucketForAgeDays(row.ageDays === null ? null : row.ageDays);
        entry.buckets[bucket.label] = (entry.buckets[bucket.label] || 0) + 1;
        entry.total += 1;
      }

      return {
        warehouses: Array.from(summaryByWarehouse.values()),
        asOf: new Date().toISOString()
      };
    }
  };
}
