export function sanitizeCsvCell(value) {
  const s = String(value ?? "");
  if (/^[=+\-@]/.test(s)) {
    return `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
