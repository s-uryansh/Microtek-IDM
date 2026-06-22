import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { DonutChart } from "../../components/charts/DonutChart.jsx";
import { HorizontalBarChart } from "../../components/charts/HorizontalBarChart.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";
import { KPIRow } from "./KPIRow.jsx";
import { RecentGrnsWidget } from "./RecentGrnsWidget.jsx";
import { RecentDispatchesWidget } from "./RecentDispatchesWidget.jsx";
import { fetchDashboardSummary } from "../../api/modules/dashboard.js";
import { useAuth } from "../../auth/useAuth.js";

const STATUS_LABELS = {
  IN_STOCK: "In Stock",
  IN_TRANSIT: "In Transit",
  DISPATCHED: "Dispatched",
  RETURNED: "Returned",
  PRODUCED: "Produced",
};

export function DashboardPage() {
  const { hasPermission } = useAuth();
  const canViewExceptions = typeof hasPermission === "function" ? hasPermission("exception:read") : false;
  const canImport = typeof hasPermission === "function" ? hasPermission("integration:import") : false;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardSummary({ signal });
      if (signal?.aborted) return;
      setSummary(data ?? null);
    } catch (err) {
      if (signal?.aborted || err?.name === "AbortError") return;
      setError(err?.message || "Failed to load dashboard");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    loadSummary({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [loadSummary]);

  const donutData = (summary?.statusBreakdown ?? [])
    .filter((r) => r.count > 0)
    .map((r) => ({ label: STATUS_LABELS[r.status] ?? r.status, value: r.count }));

  const exceptionRuleData = (summary?.exceptionsByRule ?? [])
    .map((r) => ({ label: r.ruleCode, value: r.count }));

  const warehouseData = (summary?.stockByWarehouse ?? [])
    .map((r) => ({ label: r.warehouseCode ?? `WH-${r.warehouseId}`, value: r.count }));

  if (error && !summary) {
    return (
      <div className="dashboard">
        <PageHeader title="Dashboard" subtitle="Warehouse operations overview" />
        <ErrorState title="Unable to load dashboard" message={error} onRetry={loadSummary} />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard" subtitle="Warehouse operations overview" />

      <KPIRow kpis={summary?.kpis} loading={loading} />

      <div className="dashboard__chart-row dashboard__chart-row--half">
        <Card title="Inventory Status Breakdown">
          <DonutChart
            data={donutData}
            loading={loading}
            emptyMessage="No inventory data"
          />
        </Card>
        <Card title="Inventory Ageing (Days In-Stock)">
          <BarChart
            data={summary?.ageingDistribution ?? []}
            loading={loading}
            emptyMessage="No ageing data"
          />
        </Card>
      </div>

      <div className="dashboard__chart-row dashboard__chart-row--half">
        {canViewExceptions ? (
          <Card title="Open Exceptions by Rule">
            <HorizontalBarChart
              data={exceptionRuleData}
              loading={loading}
              emptyMessage="No open exceptions"
              color="var(--color-error)"
            />
          </Card>
        ) : null}
        <Card title="In-Stock Inventory by Warehouse">
          <HorizontalBarChart
            data={warehouseData}
            loading={loading}
            emptyMessage="No stock data"
            color="var(--color-accent)"
          />
        </Card>
      </div>

      <div className="dashboard__chart-row dashboard__chart-row--half">
        <RecentGrnsWidget grns={summary?.recentGrns} loading={loading} />
        <RecentDispatchesWidget dispatches={summary?.recentDispatches} loading={loading} />
      </div>
    </div>
  );
}
