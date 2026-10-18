/**
 * Tiny RFC-4180-ish CSV serializer for paper exports. Quotes any field
 * containing a comma, double-quote, or newline; doubles up internal
 * double-quotes.
 */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
