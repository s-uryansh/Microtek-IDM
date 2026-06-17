import { useEffect, useState, useCallback } from "react";
import { DataTable } from "../../components/data/DataTable.jsx";
import { fetchExceptions } from "../../api/modules/exceptions.js";
import { Card } from "../../components/ui/Card.jsx";

const columns = [
  { key: "serialNo", label: "Serial No", filterable: false },
  { key: "ruleCode", label: "Rule" },
  { key: "contextType", label: "Context" },
  { key: "status", label: "Status" }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function RecentExceptionsWidget() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchExceptions({ pageSize: 5, signal });
      if (signal?.aborted) return;
      setData(toArray(result?.exceptions));
    } catch (err) {
      if (signal?.aborted || err?.name === "AbortError") return;
      setError(err?.message || "Failed to load exceptions");
      setData([]);
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

  return (
    <Card title="Recent Exceptions">
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={load}
        pageSize={5}
        emptyTitle="No recent exceptions"
        emptyDescription="All clear. No exceptions recorded recently."
      />
    </Card>
  );
}
