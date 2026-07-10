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
import { fetchDashboardSummary, fetchDashboardCategories } from "../../api/modules/dashboard.js";
import { searchWarehouses } from "../../api/modules/lookups.js";
import { useAuth } from "../../auth/useAuth.js";

const STATUS_LABELS = {
  IN_STOCK: "In Stock",
  IN_TRANSIT: "In Transit",
  DISPATCHED: "Dispatched",
  RETURNED: "Returned",
  PRODUCED: "Produced",
};

export function DashboardPage() {
  const { hasPermission, user } = useAuth();
  const canViewExceptions = typeof hasPermission === "function" ? hasPermission("exception:read") : false;
  const isAdmin = user?.role === "admin";

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Admin-only warehouse filter. "" means all warehouses; the server scopes
  // non-admins to their assigned warehouses regardless of this control.
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState([]);

  // Category / Sub Category / Product Category filters — re-scope ageing /
  // inventory-status / in-stock widgets. "" means no filter on that level.
  // Each level cascades: changing a level clears the levels below it.
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [categoryFilters, setCategoryFilters] = useState([]);

  const loadSummary = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardSummary({
        warehouseId: warehouseId || undefined,
        category: category || undefined,
        subCategory: subCategory || undefined,
        productCategory: productCategory || undefined,
        signal
      });
      if (signal?.aborted) return;
      setSummary(data ?? null);
    } catch (err) {
      if (signal?.aborted || err?.name === "AbortError") return;
      setError(err?.message || "Failed to load dashboard");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [warehouseId, category, subCategory, productCategory]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadSummary({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [loadSummary]);

  // Populate the admin warehouse picker once.
  useEffect(() => {
    if (!isAdmin) return undefined;
    const ctrl = new AbortController();
    searchWarehouses({ signal: ctrl.signal })
      .then((res) => setWarehouses(Array.isArray(res?.items) ? res.items : []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [isAdmin]);

  // Populate the category/sub-category/product-category pickers once; each
  // level's options are derived client-side from this one fetch.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchDashboardCategories({ signal: ctrl.signal })
      .then((res) => setCategoryFilters(Array.isArray(res?.items) ? res.items : []))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const categoryOptions = [...new Set(categoryFilters.map((c) => c.category))].sort();
  const subCategoryOptions = [...new Set(
    categoryFilters
      .filter((c) => !category || c.category === category)
      .map((c) => c.subCategory)
  )].sort();
  const productCategoryOptions = [...new Set(
    categoryFilters
      .filter((c) => !category || c.category === category)
      .filter((c) => !subCategory || c.subCategory === subCategory)
      .map((c) => c.productCategory)
  )].sort();

  const warehouseFilter = isAdmin ? (
    <div className="input-group">
      <label className="input-group__label" htmlFor="dashboard-warehouse">Warehouse</label>
      <select
        id="dashboard-warehouse"
        className="input"
        aria-label="Filter dashboard by warehouse"
        value={warehouseId}
        onChange={(e) => setWarehouseId(e.target.value)}
      >
        <option value="">All warehouses</option>
        {warehouses.map((w) => (
          <option key={w.warehouseId} value={w.warehouseId}>
            {w.code} · {w.name}
          </option>
        ))}
      </select>
    </div>
  ) : null;

  const categoryFilter = (
    <div className="input-group">
      <label className="input-group__label" htmlFor="dashboard-category">Category</label>
      <select
        id="dashboard-category"
        className="input"
        aria-label="Filter dashboard by category"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setSubCategory("");
          setProductCategory("");
        }}
      >
        <option value="">All categories</option>
        {categoryOptions.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );

  const subCategoryFilter = (
    <div className="input-group">
      <label className="input-group__label" htmlFor="dashboard-sub-category">Sub Category</label>
      <select
        id="dashboard-sub-category"
        className="input"
        aria-label="Filter dashboard by sub category"
        value={subCategory}
        onChange={(e) => {
          setSubCategory(e.target.value);
          setProductCategory("");
        }}
      >
        <option value="">All sub categories</option>
        {subCategoryOptions.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );

  const productCategoryFilter = (
    <div className="input-group">
      <label className="input-group__label" htmlFor="dashboard-product-category">Product Category</label>
      <select
        id="dashboard-product-category"
        className="input"
        aria-label="Filter dashboard by product category"
        value={productCategory}
        onChange={(e) => setProductCategory(e.target.value)}
      >
        <option value="">All product categories</option>
        {productCategoryOptions.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );

  const dashboardFilters = (
    <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
      {categoryFilter}
      {subCategoryFilter}
      {productCategoryFilter}
      {warehouseFilter}
    </div>
  );

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
        <PageHeader title="Dashboard" subtitle="Warehouse operations overview" actions={dashboardFilters} />
        <ErrorState title="Unable to load dashboard" message={error} onRetry={loadSummary} />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard" subtitle="Warehouse operations overview" actions={dashboardFilters} />

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
