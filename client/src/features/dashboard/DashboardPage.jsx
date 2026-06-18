import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { BarChart } from "../../components/charts/BarChart.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";
import { KPIRow } from "./KPIRow.jsx";
import { RecentExceptionsWidget } from "./RecentExceptionsWidget.jsx";
import { ActivityWidget } from "./ActivityWidget.jsx";
import { fetchAgeingReport } from "../../api/modules/ageing.js";
import { useAuth } from "../../auth/useAuth.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toChartData(summary) {
  return toArray(summary)
    .filter((b) => typeof b?.quantity === "number" && b.quantity > 0)
    .map((b) => ({ label: b.label, value: b.quantity }));
}

export function DashboardPage() {
  const { hasPermission } = useAuth();
  const canViewAgeing = typeof hasPermission === "function" ? hasPermission("ageing:read") : false;
  const canViewExceptions = typeof hasPermission === "function" ? hasPermission("exception:read") : false;
  const canImport = typeof hasPermission === "function" ? hasPermission("integration:import") : false;

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
    if (!canViewAgeing) {
      setAgeingLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    loadAgeing({ signal: controller.signal }).catch(() => {});
    return () => {
      controller.abort();
    };
  }, [loadAgeing, canViewAgeing]);

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard" subtitle="Warehouse operations overview" />

      <KPIRow
        ageingReport={ageingReport}
        ageingLoading={ageingLoading}
        ageingError={ageingError}
        onRetryAgeing={loadAgeing}
        canViewAgeing={canViewAgeing}
        canViewExceptions={canViewExceptions}
      />

      {canImport && (
        <div className="dashboard__chart-row">
          <Card title="IDM-01 Production Import">
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
              Production serials enter IDM-01 either via the <strong>SAP production API</strong> (signed webhook)
              or by <strong>uploading a CSV</strong>. Both run the same validation and de-duplication.
            </p>
            <Link to="/imports" className="button button--primary" style={{ marginTop: "0.75rem", display: "inline-block" }}>
              Import production batch (CSV)
            </Link>
          </Card>
        </div>
      )}

      {(canViewAgeing || canViewExceptions) && (
        <div className="dashboard__chart-row">
          {canViewAgeing && (
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
          )}
          {canViewExceptions && (
            <div className="dashboard__chart-side">
              <ActivityWidget />
            </div>
          )}
        </div>
      )}

      {canViewExceptions && (
        <div className="dashboard__table-row">
          <RecentExceptionsWidget />
        </div>
      )}
    </div>
  );
}
