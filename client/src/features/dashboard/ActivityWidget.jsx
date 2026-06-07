import { useEffect, useState, useCallback } from "react";
import { fetchExceptions } from "../../api/modules/exceptions.js";
import { Card } from "../../components/ui/Card.jsx";
import { StatusBadge } from "../../components/ui/StatusBadge.jsx";
import { ErrorState } from "../../components/ui/ErrorState.jsx";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function ActivityWidget() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExceptions({ pageSize: 8, signal });
      if (signal?.aborted) return;
      const items = toArray(data?.exceptions).map((ex) => ({
        id: ex?.exceptionId ?? ex?.serialNo ?? Math.random(),
        type: "EXCEPTION",
        module: ex?.contextType ?? "—",
        serialNo: ex?.serialNo ?? "",
        timestamp: ex?.raisedAt ?? null,
        status: ex?.status ?? "OPEN"
      }));
      setActivities(items);
    } catch (err) {
      if (signal?.aborted || err?.name === "AbortError") return;
      setError(err?.message || "Failed to load activity");
      setActivities([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [load]);

  if (loading) {
    return (
      <Card title="Recent Activity">
        <div className="activity-widget" aria-busy="true" aria-live="polite">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="activity-widget__item-skeleton">
              <div className="skeleton skeleton--badge" />
              <div className="skeleton skeleton--text" style={{ width: "70%" }} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Recent Activity">
        <ErrorState
          title="Unable to load activity"
          message={error}
          onRetry={load}
        />
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card title="Recent Activity">
        <p className="activity-widget__empty">No recent activity.</p>
      </Card>
    );
  }

  return (
    <Card title="Recent Activity">
      <div className="activity-widget">
        {activities.map((item) => (
          <div key={item.id} className="activity-widget__item">
            <div className="activity-widget__module-badge">
              {item.module}
            </div>
            <div className="activity-widget__body">
              <span className="activity-widget__serial">{item.serialNo || item.module}</span>
              <span className="activity-widget__time">
                {item.timestamp ? formatTime(item.timestamp) : "—"}
              </span>
            </div>
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "—";
  }
}
