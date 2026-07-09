export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

/* Detail-view formatters that mirror the reference layout (N/A placeholders, plain
   numbers, ISO dates, and a date+time "Uploaded Date"). */
export function orNA(value) {
  return value === null || value === undefined || value === "" ? "N/A" : value;
}

export function fmtNumberPlain(value) {
  return value === null || value === undefined || value === "" ? "N/A" : Number(value);
}
