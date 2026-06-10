import { useEffect, useState, useCallback } from "react";
import { KPICard } from "../../components/charts/KPICard.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";
import { fetchExceptions } from "../../api/modules/exceptions.js";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildKpis({ exceptionsData, ageingData, canViewAgeing, canViewExceptions }) {
  const totalInventory = safeArray(ageingData?.summary).reduce(
    (sum, b) => sum + safeNumber(b?.quantity),
    0
  );
  const openExceptions = safeNumber(exceptionsData?.total);

  const kpis = [];

  if (canViewAgeing) {
    kpis.push({
      id: "total-inventory",
      label: "Total Inventory",
      value: ageingData ? totalInventory : null,
      unit: "units",
      trend: null,
      unavailable: ageingData == null
    });
  }

  if (canViewExceptions) {
    kpis.push(
      {
        id: "open-exceptions",
        label: "Open Exceptions",
        value: exceptionsData ? openExceptions : null,
        unit: "issues",
        trend: null,
        unavailable: exceptionsData == null
      },
      {
        id: "exceptions-resolved",
        label: "Exceptions Resolved",
        value: 0,
        unit: "rate",
        trend: null
      }
    );
  }

  return kpis;
}

export function KPIRow({
  ageingReport,
  ageingLoading,
  ageingError,
  onRetryAgeing,
  canViewAgeing = true,
  canViewExceptions = true
}) {
  const [kpis, setKpis] = useState([]);
  const [exceptionsData, setExceptionsData] = useState(null);
  const [exceptionsLoading, setExceptionsLoading] = useState(true);
  const [exceptionsError, setExceptionsError] = useState(null);

  const loadExceptions = useCallback(async ({ signal } = {}) => {
    if (!canViewExceptions) {
      setExceptionsLoading(false);
      return null;
    }
    setExceptionsLoading(true);
    setExceptionsError(null);
    try {
      const data = await fetchExceptions({ status: "OPEN", pageSize: 1, signal });
      if (signal?.aborted) return null;
      setExceptionsData(data ?? null);
      return data ?? null;
    } catch (err) {
      if (signal?.aborted || err?.name === "AbortError") return null;
      setExceptionsError(err?.message || "Failed to load exceptions");
      setExceptionsData(null);
      throw err;
    } finally {
      if (!signal?.aborted) setExceptionsLoading(false);
    }
  }, [canViewExceptions]);

  const retryAll = useCallback(async () => {
    await Promise.allSettled([
      loadExceptions(),
      canViewAgeing ? onRetryAgeing?.() : Promise.resolve()
    ]);
  }, [loadExceptions, onRetryAgeing, canViewAgeing]);

  useEffect(() => {
    const controller = new AbortController();
    loadExceptions({ signal: controller.signal }).catch(() => {});
    return () => {
      controller.abort();
    };
  }, [loadExceptions]);

  useEffect(() => {
    const hasAgeing = ageingReport != null;
    const hasExceptions = exceptionsData != null;

    if (!hasAgeing && !hasExceptions) {
      setKpis([]);
      return;
    }

    setKpis(buildKpis({ exceptionsData, ageingData: ageingReport, canViewAgeing, canViewExceptions }));
  }, [ageingReport, exceptionsData, canViewAgeing, canViewExceptions]);

  // Errors only count toward the KPI state for metrics the user is permitted to see.
  const effectiveAgeingError = canViewAgeing ? ageingError : null;
  const effectiveExceptionsError = canViewExceptions ? exceptionsError : null;
  const loading = (canViewAgeing && ageingLoading) || (canViewExceptions && exceptionsLoading);
  const fullError = effectiveAgeingError && effectiveExceptionsError
    ? [effectiveAgeingError, effectiveExceptionsError].join("; ")
    : null;
  const partialError = !loading && !fullError && (effectiveAgeingError || effectiveExceptionsError)
    ? "Some metrics are unavailable. Showing partial data."
    : null;

  if (!canViewAgeing && !canViewExceptions) {
    return null;
  }

  if (loading) {
    return (
      <div className="kpi-row" aria-busy="true" aria-live="polite">
        {Array.from({ length: 3 }).map((_, i) => (
          <KPICard key={i} loading />
        ))}
      </div>
    );
  }

  if (fullError && kpis.length === 0) {
    return (
      <div className="kpi-row">
        <ErrorState
          title="Unable to load dashboard metrics"
          message={fullError}
          onRetry={retryAll}
        />
      </div>
    );
  }

  return (
    <div>
      {partialError && (
        <p className="kpi-row__warning" role="status">
          {partialError}
        </p>
      )}
      <div className="kpi-row" aria-busy={false} aria-live="polite">
        {kpis.map((kpi) => (
          <KPICard
            key={kpi.id}
            label={kpi.label}
            value={kpi.unavailable ? "—" : kpi.value}
            unit={kpi.unavailable ? "unavailable" : kpi.unit}
            trend={kpi.trend}
          />
        ))}
      </div>
    </div>
  );
}
