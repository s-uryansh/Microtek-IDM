import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";
import { BulkCsvTools } from "../../components/operations/BulkCsvTools.jsx";
import { fetchAgeingReport, fetchReconciliationVariance } from "../../api/modules/ageing.js";

const columns = [
  { key: "label", label: "Age Bucket" },
  { key: "quantity", label: "Quantity" }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toChartData(summary) {
  return toArray(summary)
    .filter((b) => typeof b?.quantity === "number" && b.quantity > 0)
    .map((b) => ({ label: b.label, value: b.quantity }));
}

export function AgeingPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [report, setReport] = useState(null);
  const [variance, setVariance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
        const varianceData = await fetchReconciliationVariance({ warehouseId: Number(id), signal });
        if (signal?.aborted) return;
        setReport(data);
        setVariance(varianceData);
      } catch (err) {
        if (signal?.aborted || err?.name === "AbortError") return;
        setError(err?.message || "Failed to load ageing report");
        setReport(null);
        setVariance(null);
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

  const chartData = toChartData(report?.summary);
  const summaryRows = toArray(report?.summary);
  const varianceRows = toArray(variance?.rows);
  const missingCount = report?.dataQuality?.missingReceivedAtCount ?? 0;
  const showReport = warehouseId && (loading || error || report);

  return (
    <div>
      <PageHeader
        title="Ageing Report"
        subtitle="Inventory ageing by warehouse"
        actions={
          <div style={{ width: 200 }}>
            <Input
              label="Warehouse ID"
              value={warehouseId}
              onChange={setWarehouseId}
              type="number"
              inputMode="numeric"
              placeholder="Filter by warehouse"
            />
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
          <Card title="CSV Export">
            <BulkCsvTools
              title="Ageing Report Export"
              templateFilename="ageing-export-template.csv"
              templateHeaders={["label", "quantity"]}
              exportLabel="Export Ageing Report"
              exportFilename={`ageing-warehouse-${warehouseId || "selected"}.csv`}
              exportHeaders={["label", "quantity"]}
              exportRows={summaryRows}
            />
            <div style={{ marginTop: "var(--space-4)" }}>
              <BulkCsvTools
                title="Variance Report Export"
                templateFilename="variance-export-template.csv"
                templateHeaders={["reconciliationRunId", "warehouseId", "productId", "sapQuantity", "idmQuantity", "varianceQuantity"]}
                exportLabel="Export Variance Report"
                exportFilename={`variance-warehouse-${warehouseId || "selected"}.csv`}
                exportHeaders={["reconciliationRunId", "warehouseId", "productId", "sapQuantity", "idmQuantity", "varianceQuantity"]}
                exportRows={varianceRows}
              />
            </div>
          </Card>
          <Card title="Ageing Distribution">
            <BarChart
              data={chartData}
              loading={loading}
              emptyMessage="No ageing data available"
            />
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
    </div>
  );
}
