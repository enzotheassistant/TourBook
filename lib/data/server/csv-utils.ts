// Cell values starting with these characters are interpreted as formulas by
// Excel, Google Sheets, and LibreOffice when a CSV is opened -- a classic
// "CSV injection" / "formula injection" vector when the value is untrusted
// user input (e.g. a guest list name like `=HYPERLINK(...)`).
const FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Neutralizes formula-injection payloads by prefixing a leading single quote,
 * per the OWASP CSV Injection mitigation. Leaves ordinary values untouched.
 */
export function sanitizeCsvField(value: string): string {
  if (value.length > 0 && FORMULA_TRIGGER_CHARS.has(value[0])) {
    return `'${value}`;
  }
  return value;
}

/** Sanitizes, quotes, and escapes a value for a single CSV cell. */
export function toCsvCell(value: string): string {
  const sanitized = sanitizeCsvField(value);
  const escaped = sanitized.replaceAll('"', '""');
  return `"${escaped}"`;
}
