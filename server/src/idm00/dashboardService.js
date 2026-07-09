export function createDashboardService({ repositories }) {
  async function getSummary({ warehouseIds, category = null }) {
    const scope = Array.isArray(warehouseIds) && warehouseIds.length ? warehouseIds : null;

    const [
      statusRows,
      excStatusRows,
      excRuleRows,
      grnsInProgress,
      dispatchesInProgress,
      recentGrns,
      recentDispatches,
      stockByWarehouse,
      ageing,
      stockBreakdown,
    ] = await Promise.all([
      repositories.dashboard.countSerialsByStatus({ warehouseIds: scope, category }),
      repositories.dashboard.countExceptionsByStatus({ warehouseIds: scope }),
      repositories.dashboard.countExceptionsByRule({ warehouseIds: scope, limit: 8 }),
      repositories.dashboard.countGrnsInProgress({ warehouseIds: scope }),
      repositories.dashboard.countDispatchesInProgress({ warehouseIds: scope }),
      repositories.dashboard.findRecentGrns({ warehouseIds: scope, limit: 5 }),
      repositories.dashboard.findRecentDispatches({ warehouseIds: scope, limit: 5 }),
      repositories.dashboard.countInStockByWarehouse({ warehouseIds: scope, category }),
      repositories.dashboard.ageingBuckets({ warehouseIds: scope, category }),
      repositories.dashboard.countInStockByCategory({ warehouseIds: scope, category }),
    ]);

    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));
    const byExc = Object.fromEntries(excStatusRows.map((r) => [r.status, r.count]));

    const BUCKET_ORDER = ["0-30", "31-60", "61-90", "91+"];
    const ageingMap = Object.fromEntries(ageing.map((r) => [r.label, r.value]));
    const ageingDistribution = BUCKET_ORDER.map((label) => ({ label, value: ageingMap[label] ?? 0 }));

    return {
      kpis: {
        inStock: byStatus.IN_STOCK ?? 0,
        inTransit: byStatus.IN_TRANSIT ?? 0,
        dispatched: byStatus.DISPATCHED ?? 0,
        returned: byStatus.RETURNED ?? 0,
        openExceptions: byExc.OPEN ?? 0,
        resolvedExceptions: (byExc.CORRECTED ?? 0) + (byExc.DISMISSED ?? 0),
        grnsInProgress,
        dispatchesInProgress,
      },
      statusBreakdown: statusRows,
      exceptionsByRule: excRuleRows,
      stockByWarehouse,
      stockBreakdown,
      ageingDistribution,
      recentGrns,
      recentDispatches,
      asOf: new Date().toISOString(),
    };
  }

  async function listCategories() {
    return repositories.dashboard.listCategories();
  }

  return { getSummary, listCategories };
}
