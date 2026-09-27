// =============================================================================
// CSV helper — converts an array of objects to a CSV string with proper
// escaping. Used by the export API routes.
// =============================================================================

import { NextResponse } from "next/server";

/**
 * Escape a value for CSV output.
 * - Wraps in double quotes if the value contains commas, quotes, or newlines
 * - Escapes internal double quotes by doubling them (RFC 4180)
 * - null/undefined → empty string
 */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of objects to a CSV string.
 *
 * @param rows Array of objects (each object = one CSV row)
 * @param headers Optional column order (defaults to Object.keys of first row)
 * @returns CSV string with header row + data rows, \n line endings
 */
export function toCsv(
  rows: Record<string, unknown>[],
  headers?: string[],
): string {
  if (rows.length === 0 && !headers) return "";

  const cols = headers || Object.keys(rows[0] || {});
  const headerLine = cols.map(escapeCsvValue).join(",");
  const dataLines = rows.map((row) =>
    cols.map((col) => escapeCsvValue(row[col])).join(","),
  );

  return [headerLine, ...dataLines].join("\n") + "\n";
}

// Alias for backward compatibility (some routes import toCSV with uppercase C)
export const toCSV = toCsv;

/**
 * Create a NextResponse for a CSV download with proper headers.
 *
 * @param csvContent The CSV string to return
 * @param filename The suggested filename for the download
 * @returns NextResponse with Content-Type: text/csv + Content-Disposition: attachment
 */
export function csvResponse(csvContent: string, filename: string): NextResponse {
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * Set the Content-Type + Content-Disposition headers for a CSV download response.
 */
export const CSV_HEADERS = {
  "Content-Type": "text/csv; charset=utf-8",
  "Content-Disposition": "attachment",
} as const;
