import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";
import { WarehouseSelector } from "../../components/operations/WarehouseSelector.jsx";
import { fetchAgeingReport, fetchAgeingBucketProducts } from "../../api/modules/ageing.js";

const columns = [
  { key: "label", label: "Age Bucket" },
  { key: "quantity", label: "Quantity" }
];

const productColumns = [
  { key: "serialNo", label: "Serial" },
  {
    key: "product",
    label: "Product",
    filterValue: (row) => row.productCode,
    render: (_value, row) => (
      <>
        <span style={{ fontWeight: 600 }}>{row.productCode}</span>
        <span style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem", display: "block" }}>
          {row.productName}
        </span>
      </>
    )
  },
  {
    key: "category",
    label: "Category",
    render: (value) => <span className="badge">{value || "—"}</span>
  },
  { key: "age", label: "Age" }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toChartData(summary) {
  return toArray(summary)
    .filter((b) => typeof b?.quantity === "number" && b.quantity > 0)
    .map((b) => ({ label: b.label, value: b.quantity, bucketCode: b.bucketCode }));
}

export function AgeingPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* Drill-down state */
  const [bucketProducts, setBucketProducts] = useState(null);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState(null);

  const load = useCallback(
    async (id, { signal } = {}) => {
      if (!id) {
        setReport(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAgeingReport({ warehouseId: Number(id), signal });
        if (signal?.aborted) return;
        setReport(data);
      } catch (err) {
        if (signal?.aborted || err?.name === "AbortError") return;
        setError(err?.message || "Failed to load ageing report");
        setReport(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!warehouseId) return;
    const controller = new AbortController();
    load(warehouseId, { signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [warehouseId, load]);

  async function handleBarClick(bar) {
    if (!warehouseId || !bar.bucketCode) return;
    setSelectedBucket(bar);
    setBucketLoading(true);
    setBucketProducts(null);
    try {
      const data = await fetchAgeingBucketProducts({
        warehouseId: Number(warehouseId),
        bucketCode: bar.bucketCode
      });
      setBucketProducts(data ?? { items: [] });
    } catch {
      setBucketProducts({ items: [] });
    } finally {
      setBucketLoading(false);
    }
  }

  function closeDrillDown() {
    setSelectedBucket(null);
    setBucketProducts(null);
  }

  const chartData = toChartData(report?.summary);
  const summaryRows = toArray(report?.summary);
  const missingCount = report?.dataQuality?.missingReceivedAtCount ?? 0;
  const showReport = warehouseId && (loading || error || report);

  return (
    <div>
      <PageHeader
        title="Ageing Report"
        subtitle="Inventory ageing by warehouse"
        actions={
          <div style={{ minWidth: 240 }}>
            <WarehouseSelector label="Warehouse" value={warehouseId} onChange={setWarehouseId} />
          </div>
        }
      />
      {!warehouseId && (
        <Card>
          <p style={{ color: "var(--color-text-muted)" }}>
            Enter a warehouse ID to load the ageing report.
          </p>
        </Card>
      )}
      {showReport && missingCount > 0 && (
        <div
          style={{
            padding: "var(--space-3)",
            marginBottom: "var(--space-4)",
            backgroundColor: "var(--color-warning-subtle, #2d2008)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-warning)",
            fontSize: "0.875rem"
          }}
        >
          Warning: {missingCount} in-stock serials are missing receipt dates and appear in &ldquo;Missing receipt date&rdquo; bucket.
        </div>
      )}
      {showReport && error && (
        <ErrorState
          title="Unable to load ageing report"
          message={error}
          onRetry={() => load(warehouseId)}
        />
      )}
      {showReport && !error && (
        <div className="warehouse-grid warehouse-grid--two">
          <Card title="Ageing Distribution">
            <BarChart
              data={chartData}
              loading={loading}
              emptyMessage="No ageing data available"
              onBarClick={handleBarClick}
            />
            {chartData.length > 0 && (
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)", textAlign: "center" }}>
                Click a bar to see products in that bucket below
              </p>
            )}
          </Card>
          <Card title="Bucket Details">
            <DataTable
              columns={columns}
              data={summaryRows}
              loading={loading}
              error={null}
              pageSize={10}
              sortable={false}
            />
          </Card>
        </div>
      )}

      {/* Inline drill-down: products for the selected bucket, shown under the chart on the page */}
      {showReport && !error && selectedBucket && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Card title={`${selectedBucket.label} — Products`}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
              <Button variant="ghost" size="sm" onClick={closeDrillDown}>
                Close
              </Button>
            </div>
            {bucketLoading && (
              <p style={{ color: "var(--color-text-muted)" }}>Loading products...</p>
            )}
            {!bucketLoading && bucketProducts && (
              <DataTable
                columns={productColumns}
                data={toArray(bucketProducts.items).map((item) => ({
                  ...item,
                  product: item.productCode,
                  category: item.category || item.segment || "—",
                  age: item.ageDays !== null && item.ageDays !== undefined ? `${item.ageDays}d` : "—"
                }))}
                pageSize={10}
                emptyTitle="No products in this bucket"
                sortable={true}
              />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
