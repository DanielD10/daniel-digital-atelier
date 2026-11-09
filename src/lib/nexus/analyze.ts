import { parseCsv } from "./csv";
import { detectFindings } from "./findings";
import { profileTable } from "./profile";
import { LIMITS, type Analysis, type Table } from "./types";

/** Why a file can't be used, and what HTTP status says so honestly. */
export class DataRejected extends Error {
  constructor(
    public readonly detail: string,
    public readonly status: 413 | 422 = 422,
  ) {
    super(detail);
    this.name = "DataRejected";
  }
}

/**
 * Does this look like a binary file someone dropped by mistake?
 *
 * Reading a PNG or an .xlsx as text produces mojibake that parses
 * perfectly well into one enormous column, and the panel would have
 * reported "0 rows, nothing found" — technically true and useless. NUL
 * bytes and replacement characters never occur in real delimited text
 * in any quantity, so a sample of the head is enough to tell.
 */
function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096);
  if (sample.length === 0) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    // Control characters other than tab, newline and carriage return,
    // plus U+FFFD, which is what a failed decode leaves behind.
    if ((c < 9 || (c > 13 && c < 32)) || c === 0xfffd) bad++;
  }
  return bad / sample.length > 0.02;
}

/** bytes → table → profile → findings. The only entry point callers need. */
export function analyzeCsv(
  text: string,
  opts: { maxRows?: number; maxBytes?: number } = {},
): { table: Table; analysis: Analysis } {
  const maxRows = opts.maxRows ?? LIMITS.maxRows;
  const maxBytes = opts.maxBytes ?? LIMITS.maxBytes;
  const started = Date.now();

  if (text.length > maxBytes * 2) {
    throw new DataRejected(
      `File is larger than the ${Math.round(maxBytes / 1024 / 1024)}MB ceiling.`,
      413,
    );
  }
  if (looksBinary(text)) {
    throw new DataRejected(
      "That looks like a binary file rather than delimited text. NEXUS reads CSV, TSV and other plain-text tables — export your spreadsheet as CSV first.",
    );
  }

  const parsed = parseCsv(text, maxRows);
  if (parsed.headers.length === 0) {
    throw new DataRejected("No header row found. The first line should name the columns.");
  }
  if (parsed.headers.length > LIMITS.maxColumns) {
    throw new DataRejected(
      `${parsed.headers.length} columns; the ceiling is ${LIMITS.maxColumns}.`,
      413,
    );
  }
  if (parsed.rows.length === 0) {
    throw new DataRejected(
      "There's a header but no data rows under it. Check the file isn't empty or truncated.",
    );
  }
  if (parsed.rows.length > maxRows) {
    throw new DataRejected(
      `${parsed.rows.length.toLocaleString()} rows; the ceiling is ${maxRows.toLocaleString()}.`,
      413,
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
