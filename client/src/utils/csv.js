function escapeCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// columns: [{ key, label }], rows: plain objects (not JSX-decorated table rows).
export function toCsv(columns, rows) {
  const header = columns.map((col) => escapeCsvValue(col.label)).join(",");
  const body = rows.map((row) => columns.map((col) => escapeCsvValue(row[col.key])).join(","));
  return [header, ...body].join("\n");
}

export function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
