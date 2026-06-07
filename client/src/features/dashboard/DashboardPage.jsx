import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";
import { KPIRow } from "./KPIRow.jsx";
import { RecentExceptionsWidget } from "./RecentExceptionsWidget.jsx";
import { ActivityWidget } from "./ActivityWidget.jsx";
import { fetchAgeingReport } from "../../api/modules/ageing.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toChartData(summary) {
  return toArray(summary)
    .filter((b) => typeof b?.quantity === "number" && b.quantity > 0)
    .map((b) => ({ label: b.label, value: b.quantity }));
}

export function DashboardPage() {
  const [ageingReport, setAgeingReport] = useState(null);
  const [ageingData, setAgeingData] = useState([]);
  const [ageingLoading, setAgeingLoading] = useState(true);
  const [ageingError, setAgeingError] = useState(null);

  const loadAgeing = useCallback(async ({ signal } = {}) => {
    setAgeingLoading(true);
    setAgeingError(null);
    try {
      const data = await fetchAgeingReport({ warehouseId: 3, signal });
      if (signal?.aborted) return null;
      setAgeingReport(data ?? null);
      setAgeingData(toChartData(data?.summary));
      return data ?? null;
    } catch (err) {
      if (signal?.aborted || err?.name === "AbortError") return null;
      setAgeingError(err?.message || "Failed to load ageing data");
      setAgeingReport(null);
      setAgeingData([]);
      throw err;
    } finally {
      if (!signal?.aborted) setAgeingLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAgeing({ signal: controller.signal }).catch(() => {});
    return () => {
      controller.abort();
    };
  }, [loadAgeing]);

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard" subtitle="Warehouse operations overview" />

      <KPIRow
        ageingReport={ageingReport}
        ageingLoading={ageingLoading}
        ageingError={ageingError}
        onRetryAgeing={loadAgeing}
      />

      <div className="dashboard__chart-row">
        <div className="dashboard__chart-main">
          <Card title="Inventory Ageing Distribution">
            {ageingError ? (
              <ErrorState
                title="Unable to load ageing data"
                message={ageingError}
                onRetry={loadAgeing}
              />
            ) : (
              <BarChart
                data={ageingData}
                loading={ageingLoading}
                emptyMessage="No ageing data available"
              />
            )}
          </Card>
        </div>
        <div className="dashboard__chart-side">
          <ActivityWidget />
        </div>
      </div>

      <div className="dashboard__table-row">
        <RecentExceptionsWidget />
      </div>
    </div>
  );
}
