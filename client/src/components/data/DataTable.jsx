import { useState, useMemo } from "react";

import { ColumnSortHeader } from "./ColumnSortHeader.jsx";
import { Pagination } from "./Pagination.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { EmptyState } from "../ui/EmptyState.jsx";
import { ErrorState } from "../ui/ErrorState.jsx";

const PAGE_SIZE = 10;

export function DataTable({
  columns,
  data,
  loading,
  error,
  onRetry,
  pageSize = PAGE_SIZE,
  emptyTitle = "No data",
  emptyDescription = "",
  sortable = true,
  className = "",
  onRowClick
}) {
  const [sort, setSort] = useState({ key: null, direction: null });
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort.key || !sort.direction) return data || [];
    return [...(data || [])].sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === "string"
        ? aVal.localeCompare(bVal)
        : aVal - bVal;
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, sort]);

  const totalPages = Math.max(1, Math.ceil((sorted.length || 0) / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handleSort(newSort) {
    setSort(newSort);
    setPage(1);
  }

  function handlePageChange(p) {
    setPage(p);
  }

  function handleRowKeyDown(event, row) {
    if (!onRowClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick(row);
    }
  }

  if (error) {
    return (
      <div className={`data-table ${className}`.trim()}>
        <ErrorState
          title="Failed to load data"
          message={error}
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`data-table ${className}`.trim()}>
        <div className="data-table__skeleton">
          <div className="data-table__header-row">
            {columns.map((col) => (
              <div key={col.key} className="skeleton skeleton--text" style={{ width: "40%" }} />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="data-table__skeleton-row">
              {columns.map((col) => (
                <div key={col.key} className="skeleton skeleton--text" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`data-table ${className}`.trim()}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={`data-table ${className}`.trim()}>
      <div className="data-table__wrapper">
        <table className="data-table__table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="data-table__th">
                  {sortable && col.sortable !== false ? (
                    <ColumnSortHeader
                      label={col.label}
                      sortKey={col.key}
                      currentSort={sort}
                      onSort={handleSort}
                    />
                  ) : (
                    <span className="data-table__th-label">{col.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
              {paginated.map((row, rowIndex) => (
                  <tr
                    key={row.id ?? rowIndex}
                    className={`data-table__row${onRowClick ? " data-table__row--clickable" : ""}`}
                    onClick={() => onRowClick?.(row)}
                    onKeyDown={(event) => handleRowKeyDown(event, row)}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={onRowClick ? `Open row ${rowIndex + 1}` : undefined}
                  >
                {columns.map((col) => (
                  <td key={col.key} className="data-table__td">
                    {col.render ? col.render(row[col.key], row) : renderCell(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

function renderCell(value) {
  if (value == null) return <span className="data-table__null">--</span>;
  if (typeof value === "string" && isStatusValue(value)) {
    return <StatusBadge status={value} />;
  }
  return value;
}

const STATUS_VALUES = new Set([
  "OPEN", "CLOSED", "CORRECTED",
  "PENDING", "IN_PROGRESS", "DISPATCHED", "COMPLETED",
  "ACCEPTED", "REJECTED",
  "MATCHED", "SHORT", "EXCESS",
  "SALEABLE", "DEFECTIVE", "REPAIR"
]);

function isStatusValue(v) {
  return STATUS_VALUES.has(v.toUpperCase());
}
