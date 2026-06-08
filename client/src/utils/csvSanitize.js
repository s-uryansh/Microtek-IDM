export function sanitizeCsvCell(value) {
  const s = String(value ?? "");
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}
