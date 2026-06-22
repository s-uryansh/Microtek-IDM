import { Children, isValidElement, useEffect, useMemo, useState } from "react";

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
  filterable = true,
  searchable = false,
  searchPlaceholder = "Search this table",
  className = "",
  onRowClick
}) {
  const [sort, setSort] = useState({ key: null, direction: null });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [query, setQuery] = useState("");

  const filterableColumns = useMemo(() => (
    columns.filter((col) => col.filterable !== false && col.key !== "_actions")
  ), [columns]);

  const filterOptions = useMemo(() => {
    const rows = data || [];
    return Object.fromEntries(
      filterableColumns.map((col) => {
        const values = [...new Set(
          rows
            .map((row) => getFilterText(row, col))
            .filter((value) => value.length > 0)
        )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return [col.key, values];
      })
    );
  }, [data, filterableColumns]);

  const visibleFilterColumns = filterableColumns.filter((col) => (filterOptions[col.key] || []).length > 1);

  const filtered = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, value]) => value);
    const term = query.trim().toLowerCase();
    let rows = data || [];

    if (activeFilters.length > 0) {
      rows = rows.filter((row) =>
        activeFilters.every(([key, value]) => {
          const col = columns.find((column) => column.key === key);
          if (!col) return true;
          return getFilterText(row, col) === value;
        })
      );
    }

    if (term) {
      // Free-text search spans every column's filter text — this is how serial
      // numbers (no longer a dropdown) stay findable.
      rows = rows.filter((row) =>
        columns.some((col) => getFilterText(row, col).toLowerCase().includes(term))
      );
    }

    return rows;
  }, [columns, data, filters, query]);

  const sorted = useMemo(() => {
    if (!sort.key || !sort.direction) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === "string"
        ? aVal.localeCompare(bVal)
        : aVal - bVal;
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  useEffect(() => {
    setPage(1);
  }, [filters, data, query]);

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

  function handleFilterChange(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function clearFilters() {
    setFilters({});
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
      {searchable && (
        <div className="data-table__search input-group" style={{ marginBottom: "var(--space-3)" }}>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Search table"
          />
        </div>
      )}
      {filterable && visibleFilterColumns.length > 0 && (
        <div
          className="data-table__filters"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)"
          }}
        >
          {visibleFilterColumns.map((col) => (
            <div key={col.key} className="input-group">
              <label className="input-group__label" htmlFor={`data-table-filter-${col.key}`}>
                Filter {col.label}
              </label>
              <select
                id={`data-table-filter-${col.key}`}
                className="input"
                value={filters[col.key] || ""}
                onChange={(event) => handleFilterChange(col.key, event.target.value)}
              >
                <option value="">All {col.label}</option>
                {filterOptions[col.key].map((value) => (
                  <option key={value} value={value}>
                    {col.label}: {value}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {Object.values(filters).some(Boolean) && (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="button button--secondary button--sm" type="button" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}
      {filtered.length === 0 ? (
        <EmptyState title="No matching data" description="Adjust or clear the table filters." />
      ) : (
      <>
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
      </>
      )}
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

function getFilterText(row, col) {
  if (typeof col.filterValue === "function") {
    return normalizeFilterValue(col.filterValue(row));
  }

  const explicit = row?.[`${col.key}Filter`];
  if (explicit !== undefined) {
    return normalizeFilterValue(explicit);
  }

  return normalizeFilterValue(row?.[col.key]);
}

function findStatusProp(node) {
  if (!isValidElement(node)) return "";
  const status = node.props?.status;
  if (typeof status === "string" || typeof status === "number") {
    return String(status);
  }
  for (const child of Children.toArray(node.props?.children ?? [])) {
    const found = findStatusProp(child);
    if (found) return found;
  }
  return "";
}

function normalizeFilterValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFilterValue).filter(Boolean).join(" ");
  }
  if (isValidElement(value)) {
    // A status column rendered as JSX (e.g. <StatusBadge status="OPEN" />, possibly
    // wrapped) still needs a clean filter value. Prefer a nested status prop so the
    // dropdown shows the status code; otherwise fall back to the element's text.
    const status = findStatusProp(value);
    if (status) return status;
    return normalizeFilterValue(Children.toArray(value.props?.children ?? []));
  }
  return "";
}

const STATUS_VALUES = new Set([
  "OPEN", "CLOSED", "CORRECTED", "DISMISSED",
  "PENDING", "IN_PROGRESS", "DISPATCHED", "COMPLETED", "COMMITTED",
  "ACCEPTED", "REJECTED",
  "MATCHED", "SHORT", "EXCESS",
  "SALEABLE", "DEFECTIVE", "REPAIR",
  "WRONG_SERIAL", "IMPORT_FAILED", "DUPLICATE_SCAN",
  "ALREADY_DISPATCHED", "NOT_FOUND", "CONDITION_HOLD",
  "BATTERY_NOT_PREBILLED", "RETURNED", "IN_TRANSIT", "PRODUCED"
]);

function isStatusValue(v) {
  return STATUS_VALUES.has(v.toUpperCase());
}
