export function ColumnSortHeader({ label, sortKey, currentSort, onSort, className = "" }) {
  const isActive = currentSort?.key === sortKey;
  const direction = isActive ? currentSort.direction : null;

  function handleClick() {
    if (!isActive) {
      onSort({ key: sortKey, direction: "asc" });
    } else if (direction === "asc") {
      onSort({ key: sortKey, direction: "desc" });
    } else {
      onSort({ key: null, direction: null });
    }
  }

  return (
    <button
      className={`col-sort-header ${isActive ? "col-sort-header--active" : ""} ${className}`.trim()}
      onClick={handleClick}
      type="button"
      aria-label={`Sort by ${label}${isActive ? `, ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
    >
      <span className="col-sort-header__label">{label}</span>
      <span className="col-sort-header__arrows" aria-hidden="true">
        <svg
          className="col-sort-header__arrow col-sort-header__arrow--asc"
          width="8"
          height="5"
          viewBox="0 0 8 5"
          fill="none"
        >
          <path
            d="M4 0 L8 5 L0 5 Z"
            fill={isActive && direction === "asc" ? "var(--color-accent)" : "var(--color-text-muted)"}
          />
        </svg>
        <svg
          className="col-sort-header__arrow col-sort-header__arrow--desc"
          width="8"
          height="5"
          viewBox="0 0 8 5"
          fill="none"
        >
          <path
            d="M4 5 L8 0 L0 0 Z"
            fill={isActive && direction === "desc" ? "var(--color-accent)" : "var(--color-text-muted)"}
          />
        </svg>
      </span>
    </button>
  );
}
