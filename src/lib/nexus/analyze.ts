import { parseCsv } from "./csv";
import { detectFindings } from "./findings";
import { profileTable } from "./profile";
import { LIMITS, type Analysis, type Table } from "./types";

export class DataTooLargeError extends Error {
  constructor(public readonly detail: string) {
    super(detail);
    this.name = "DataTooLargeError";
  }
}

/** bytes → table → profile → findings. The only entry point callers need. */
export function analyzeCsv(text: string): { table: Table; analysis: Analysis } {
  const started = Date.now();

  if (text.length > LIMITS.maxBytes * 2) {
    throw new DataTooLargeError(
      `File is larger than the ${Math.round(LIMITS.maxBytes / 1024 / 1024)}MB ceiling.`,
    );
  }

  const parsed = parseCsv(text);
  if (parsed.headers.length === 0) {
    throw new DataTooLargeError("No header row found. The first line should name the columns.");
  }
  if (parsed.headers.length > LIMITS.maxColumns) {
    throw new DataTooLargeError(
      `${parsed.headers.length} columns; the ceiling is ${LIMITS.maxColumns}.`,
    );
  }
  if (parsed.rows.length > LIMITS.maxRows) {
    throw new DataTooLargeError(
      `${parsed.rows.length.toLocaleString()} rows; the ceiling is ${LIMITS.maxRows.toLocaleString()}.`,
    );
  }

  const table: Table = {
    headers: parsed.headers,
    rows: parsed.rows,
    malformed: parsed.malformed,
  };

  const profile = profileTable(table);
  const findings = detectFindings(table, profile);

  return {
    table,
    analysis: {
      table: {
        rows: table.rows.length,
        columns: table.headers.length,
        malformed: table.malformed,
      },
      columns: profile.columns,
      quality: profile.quality.sort(
        (a, b) => severityRank(b.severity) - severityRank(a.severity),
      ),
      findings,
      elapsedMs: Date.now() - started,
    },
  };
}

function severityRank(s: "high" | "medium" | "low"): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}
