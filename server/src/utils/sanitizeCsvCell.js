export function sanitizeCsvCell(value) {
  const s = String(value ?? "");
  // Formula-injection guard: a cell beginning with = + - @ TAB(0x09) or CR(0x0D)
  // can execute in Excel/Sheets. Prefix with a single quote so it is treated as
  // text. (OWASP CSV-injection prevention.)
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
