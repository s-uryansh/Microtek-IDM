import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { DataTable } from "../../components/data/DataTable.jsx";
import { Input } from "../../components/ui/Input.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";
import { fetchAgeingReport, fetchAgeingBucketProducts } from "../../api/modules/ageing.js";
import { useAuth } from "../../auth/useAuth.js";

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
    .map((b) => ({ label: b.label, value: b.quantity, bucketCode: b.bucketCode }));
}

export function AgeingPage() {
  const { user } = useAuth();
  const [warehouseId, setWarehouseId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* Drill-down state */
  const [bucketProducts, setBucketProducts] = useState(null);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState(null);

  useEffect(() => {
    const assignedWarehouseId = user?.defaultWarehouseId ?? user?.warehouseIds?.[0];
    if (!warehouseId && assignedWarehouseId) {
      setWarehouseId(String(assignedWarehouseId));
    }
  }, [user, warehouseId]);

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
          <Card title="Ageing Distribution">
            <BarChart
              data={chartData}
              loading={loading}
              emptyMessage="No ageing data available"
              onBarClick={selectedBucket ? undefined : handleBarClick}
            />
            {chartData.length > 0 && !selectedBucket && (
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)", textAlign: "center" }}>
                Click a bar to see products in that bucket
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

      {/* Drill-down modal */}
      {selectedBucket && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "var(--space-4)"
          }}
          onClick={closeDrillDown}
          role="dialog"
          aria-modal="true"
          aria-label="Bucket products"
        >
          <div
            style={{
              backgroundColor: "var(--color-bg-surface)",
              borderRadius: "var(--radius-lg)",
              maxWidth: 800,
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              padding: "var(--space-6)",
              boxShadow: "var(--shadow-lg)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.125rem" }}>
                {selectedBucket.label} — Products
              </h2>
              <Button variant="ghost" size="sm" onClick={closeDrillDown}>
                Close
              </Button>
            </div>
            {bucketLoading && (
              <p style={{ color: "var(--color-text-muted)" }}>Loading products...</p>
            )}
            {!bucketLoading && bucketProducts && (
              <table className="data-table__table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Serial</th>
                    <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Product</th>
                    <th className="data-table__th" style={{ textAlign: "left", padding: "var(--space-2)" }}>Category</th>
                    <th className="data-table__th" style={{ textAlign: "right", padding: "var(--space-2)" }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {(!bucketProducts.items || bucketProducts.items.length === 0) && (
                    <tr className="data-table__row">
                      <td colSpan={4} style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--color-text-muted)" }}>
                        No products in this bucket
                      </td>
                    </tr>
                  )}
                  {toArray(bucketProducts.items).map((item) => (
                    <tr key={item.serialId} className="data-table__row">
                      <td style={{ padding: "var(--space-2)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
                        {item.serialNo}
                      </td>
                      <td style={{ padding: "var(--space-2)" }}>
                        <span style={{ fontWeight: 600 }}>{item.productCode}</span>
                        <span style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem", display: "block" }}>
                          {item.productName}
                        </span>
                      </td>
                      <td style={{ padding: "var(--space-2)" }}>
                        <span className="badge">{item.category || item.segment || "—"}</span>
                      </td>
                      <td style={{ padding: "var(--space-2)", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {item.ageDays !== null && item.ageDays !== undefined ? `${item.ageDays}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
