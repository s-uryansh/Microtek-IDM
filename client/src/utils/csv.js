import { sanitizeCsvCell } from "./csvSanitize.js";

export function parseCsv(text) {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].split(",").map((header) => header.trim());
  return {
    headers,
    rows: rows.slice(1).map((line, index) => {
      const values = line.split(",").map((value) => value.trim());
      return headers.reduce((row, header, headerIndex) => ({
        ...row,
        [header]: values[headerIndex] || "",
        rowNumber: index + 2
      }), {});
    })
  };
}

export function toCsv(rows, headers) {
  const headerLine = headers.map((header) => csvCell(header)).join(",");
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headerLine, ...body].join("\n");
}

function csvCell(value) {
  const text = sanitizeCsvCell(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function downloadCsv(filename, rows, headers) {
  const blob = new Blob([toCsv(rows, headers)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
