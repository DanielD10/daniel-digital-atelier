import { LIMITS, type Table } from "./types";

/**
 * A CSV parser that handles the files people actually have.
 *
 * Splitting on commas works until the first address field, so this is a
 * character state machine instead: quoted sections swallow delimiters and
 * newlines, and a doubled quote inside a quoted section is a literal one.
 * It also sniffs the delimiter, because half the "CSV" exports in the
 * world are tab- or semicolon-separated.
 */

const DELIMITERS = [",", "\t", ";", "|"] as const;

/**
 * Pick a delimiter by consistency, not by frequency.
 *
 * A file full of prose has plenty of commas but a ragged column count;
 * the real delimiter is the one that gives every line the same arity.
 * Scoring on agreement rather than raw count stops a description field
 * from outvoting the actual separator.
 */
function sniffDelimiter(sample: string): string {
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (lines.length === 0) return ",";

  let best = ",";
  let bestScore = -1;

  for (const delim of DELIMITERS) {
    const counts = lines.map((line) => countOutsideQuotes(line, delim));
    if (counts[0] === 0) continue;
    const agree = counts.filter((c) => c === counts[0]).length / counts.length;
    // Agreement dominates; column count only breaks ties.
    const score = agree * 100 + Math.min(counts[0], 40);
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delim: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (ch === delim && !quoted) count++;
  }
  return count;
}

export interface ParseResult extends Table {
  delimiter: string;
  truncated: boolean;
}

export function parseCsv(input: string): ParseResult {
  // Strip a BOM; Excel writes one and it corrupts the first header.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = sniffDelimiter(text.slice(0, 64 * 1024));

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let truncated = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    // Ignore the blank record a trailing newline produces.
    if (record.length > 1 || record[0] !== "") records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === "\n") {
      pushRecord();
      if (records.length > LIMITS.maxRows + 1) {
        truncated = true;
        break;
      }
    } else if (ch === "\r") {
      // CRLF: the \n does the work. A lone \r also ends a record.
      if (text[i + 1] !== "\n") pushRecord();
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) pushRecord();

  if (records.length === 0) {
    return { headers: [], rows: [], malformed: 0, delimiter, truncated };
  }

  const headers = normaliseHeaders(records[0]);
  const width = headers.length;
  const rows: string[][] = [];
  let malformed = 0;

  for (let r = 1; r < records.length; r++) {
    const row = records[r];
    if (row.length === width) {
      rows.push(row);
    } else if (row.length === 1 && row[0].trim() === "") {
      // A blank line in the middle of a file is not a malformed row.
      continue;
    } else if (row.length < width) {
      // Short rows are common and recoverable: pad and keep the data.
      rows.push([...row, ...Array(width - row.length).fill("")]);
      malformed++;
    } else {
      rows.push(row.slice(0, width));
      malformed++;
    }
  }

  return { headers, rows, malformed, delimiter, truncated };
}

/**
 * Headers have to be unique — the UI keys off them — but the original
 * text is what the person recognises, so duplicates get a suffix rather
 * than being rewritten.
 */
function normaliseHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = h.trim();
    if (!name) name = `column_${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return n === 0 ? name : `${name} (${n + 1})`;
  });
}
