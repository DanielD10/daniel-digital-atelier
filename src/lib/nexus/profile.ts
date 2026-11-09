import {
  balance,
  histogram,
  mad,
  mean,
  median,
  quantile,
  stdev,
} from "./stats";
import {
  LIMITS,
  type ColumnKind,
  type ColumnProfile,
  type QualityIssue,
  type Table,
} from "./types";

/**
 * Type inference and column profiling.
 *
 * Types are decided from the values, never from the header: a column
 * called "id" full of prices is a price column, and "2024 Revenue" is
 * not a date. Inference happens per column rather than per value, which
 * is the only way to resolve genuinely ambiguous formats — 03/04/2025
 * is unknowable alone and obvious in the company of 17/04/2025.
 */

/**
 * Stop tracking exact cardinality past this many levels. A column with
 * more is an identifier or free text, never a category, and building a
 * million-entry hash to establish that costs far more than the answer
 * is worth.
 */
const DISTINCT_CAP = 20_000;

const BLANK = new Set(["", "-", "—", "n/a", "na", "null", "nil", "none", "nan", "#n/a"]);
const TRUTHY = new Set(["true", "yes", "y", "t", "1"]);
const FALSEY = new Set(["false", "no", "n", "f", "0"]);

/**
 * Blank-value test, on the hot path for every cell in the table.
 *
 * The obvious one-liner lowercases and trims every value it is handed,
 * which at a million rows across a dozen columns is twelve million
 * throwaway strings. Every token in BLANK is six characters or fewer,
 * so anything longer cannot be one and can be rejected before any
 * allocation happens.
 */
export function isBlank(v: string): boolean {
  if (v.length === 0) return true;
  if (v.length > 6) return false;
  return BLANK.has(v.trim().toLowerCase());
}

const CURRENCY_RE = /[$£€¥₹]/;
const NUMBER_CLEAN_RE = /[\s,_$£€¥₹%]/g;

/**
 * Parse the numbers spreadsheets produce: thousands separators, currency
 * marks, trailing percent signs, and accounting negatives in parentheses.
 */
export function parseNumber(raw: string): number | null {
  const v = raw.trim();
  if (!v || isBlank(v)) return null;
  const negative = /^\(.*\)$/.test(v);
  const cleaned = (negative ? v.slice(1, -1) : v).replace(NUMBER_CLEAN_RE, "");
  if (cleaned === "" || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(cleaned)) {
    return null;
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

type DateOrder = "iso" | "mdy" | "dmy";

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const SLASH_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T ](\d{1,2}):(\d{2}))?/;

/**
 * Work out whether a slashed column is month-first or day-first by
 * looking for a value that can only be read one way. Falls back to
 * month-first, which is the right guess for a US-authored file.
 */
function detectDateOrder(values: string[]): DateOrder {
  let sawIso = 0;
  let sawSlash = 0;
  let firstOver12 = false;
  let secondOver12 = false;

  for (const v of values) {
    if (ISO_RE.test(v)) {
      sawIso++;
      continue;
    }
    const m = SLASH_RE.exec(v);
    if (!m) continue;
    sawSlash++;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) firstOver12 = true;
    if (b > 12) secondOver12 = true;
  }
  if (sawIso > sawSlash) return "iso";
  if (firstOver12 && !secondOver12) return "dmy";
  return "mdy";
}

/** Parse to a UTC timestamp. UTC throughout, so no value shifts a day. */
export function parseDate(raw: string, order: DateOrder): number | null {
  const v = raw.trim();
  if (!v || isBlank(v)) return null;

  const iso = ISO_RE.exec(v);
  if (iso) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = iso;
    const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    return Number.isFinite(t) ? t : null;
  }

  const sl = SLASH_RE.exec(v);
  if (sl) {
    const a = Number(sl[1]);
    const b = Number(sl[2]);
    let year = Number(sl[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const month = order === "dmy" ? b : a;
    const day = order === "dmy" ? a : b;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const t = Date.UTC(year, month - 1, day, Number(sl[4] ?? 0), Number(sl[5] ?? 0));
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function looksLikeDate(v: string): boolean {
  return ISO_RE.test(v.trim()) || SLASH_RE.test(v.trim());
}

/**
 * Decide a column's kind from a non-blank sample.
 *
 * Order matters. Booleans are checked before numbers because 0/1 is a
 * valid boolean encoding, and dates before numbers because 2024 would
 * otherwise read as an integer.
 */
function inferKind(
  values: string[],
  distinct: number,
  totalRows: number,
): { kind: ColumnKind; dateOrder: DateOrder } {
  const dateOrder = detectDateOrder(values);
  if (values.length === 0) return { kind: "empty", dateOrder };

  const sample = values.length > 2000 ? values.slice(0, 2000) : values;
  const n = sample.length;

  const lower = sample.map((v) => v.trim().toLowerCase());
  const boolish = lower.filter((v) => TRUTHY.has(v) || FALSEY.has(v)).length;
  if (boolish / n > 0.98 && distinct <= 3) return { kind: "boolean", dateOrder };

  const dateish = sample.filter(looksLikeDate).length;
  if (dateish / n > 0.9) return { kind: "date", dateOrder };

  const numeric = sample.filter((v) => parseNumber(v) !== null);
  if (numeric.length / n > 0.95) {
    const hasCurrency = sample.some((v) => CURRENCY_RE.test(v));
    if (hasCurrency) return { kind: "currency", dateOrder };
    const hasPercent = sample.filter((v) => v.includes("%")).length / n > 0.8;
    if (hasPercent) return { kind: "percent", dateOrder };
    const allInt = numeric.every((v) => Number.isInteger(parseNumber(v)!));
    // Near-unique integers that are never aggregated meaningfully are keys.
    if (allInt && distinct === totalRows && totalRows > 20) {
      return { kind: "identifier", dateOrder };
    }
    return { kind: allInt ? "integer" : "number", dateOrder };
  }

  // Strings: a key if nearly every value is unique, a category if few are.
  const uniqueness = distinct / Math.max(1, values.length);
  if (uniqueness > 0.95 && totalRows > 20) return { kind: "identifier", dateOrder };
  const avgLen = mean(sample.map((v) => v.length));
  if (distinct <= Math.max(2, Math.min(64, totalRows * 0.5)) && avgLen < 64) {
    return { kind: "category", dateOrder };
  }
  return { kind: "text", dateOrder };
}

export interface ProfileResult {
  columns: ColumnProfile[];
  quality: QualityIssue[];
  /*
   * Typed views, kept beside the profile so detectors don't re-parse.
   *
   * Float64Array with NaN standing in for null, rather than
   * Array<number | null>. A boxed array of a million entries costs
   * roughly fifty megabytes and pointer-chases on every read; the
   * typed one is eight megabytes of contiguous memory. Callers must
   * test with Number.isNaN rather than `=== null`.
   */
  numericValues: Map<number, Float64Array>;
  dateValues: Map<number, Float64Array>;
  dateOrders: Map<number, DateOrder>;
}

export function profileTable(table: Table): ProfileResult {
  const { headers, rows } = table;
  const columns: ColumnProfile[] = [];
  const quality: QualityIssue[] = [];
  const numericValues = new Map<number, Float64Array>();
  const dateValues = new Map<number, Float64Array>();
  const dateOrders = new Map<number, DateOrder>();

  for (let c = 0; c < headers.length; c++) {
    const present: string[] = [];
    const counts = new Map<string, number>();
    let missing = 0;
    /*
     * Stop counting distinct values once a column is obviously a key.
     *
     * An order_id column with a million unique values builds a
     * million-entry hash of strings to learn one thing: that it is an
     * identifier. Past the cap the exact count stops mattering — every
     * decision downstream only asks whether cardinality is low enough
     * for the column to be a category — so counting stops and the
     * tally becomes a floor rather than an exact figure.
     */
    let overflowed = false;

    for (let r = 0; r < rows.length; r++) {
      const raw = rows[r][c] ?? "";
      if (isBlank(raw)) {
        missing++;
        continue;
      }
      const v = raw.trim();
      // Only the head is retained for inference and samples; the full
      // column was never read past this point.
      if (present.length < 4000) present.push(v);
      if (!overflowed) {
        const seen = counts.get(v);
        if (seen !== undefined) counts.set(v, seen + 1);
        else if (counts.size < DISTINCT_CAP) counts.set(v, 1);
        else overflowed = true;
      }
    }

    const distinct = overflowed ? rows.length - missing : counts.size;
    const { kind, dateOrder } = inferKind(present, distinct, rows.length);
    dateOrders.set(c, dateOrder);

    const profile: ColumnProfile = {
      name: headers[c],
      index: c,
      kind,
      missing: rows.length === 0 ? 0 : missing / rows.length,
      distinct,
      coercionFailures: 0,
      sample: present.slice(0, 5),
    };

    if (kind === "number" || kind === "integer" || kind === "currency" || kind === "percent") {
      const typed = new Float64Array(rows.length);
      const clean: number[] = [];
      for (let r = 0; r < rows.length; r++) {
        const n = parseNumber(rows[r][c] ?? "");
        typed[r] = n ?? NaN;
        if (n !== null) clean.push(n);
        else if (!isBlank(rows[r][c] ?? "")) profile.coercionFailures++;
      }
      numericValues.set(c, typed);
      if (clean.length > 0) {
        const sorted = [...clean].sort((a, b) => a - b);
        const med = quantile(sorted, 0.5);
        const spread = mad(clean);
        const fence = spread > 0 ? 3 * spread : Infinity;
        profile.numeric = {
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: mean(clean),
          median: med,
          mad: spread,
          stdev: stdev(clean),
          q1: quantile(sorted, 0.25),
          q3: quantile(sorted, 0.75),
          sum: clean.reduce((a, b) => a + b, 0),
          outlierCount:
            fence === Infinity ? 0 : clean.filter((v) => Math.abs(v - med) > fence).length,
          histogram: histogram(clean, 24),
        };
      }
    } else if (kind === "date") {
      const typed = new Float64Array(rows.length);
      const clean: number[] = [];
      for (let r = 0; r < rows.length; r++) {
        const t = parseDate(rows[r][c] ?? "", dateOrder);
        typed[r] = t ?? NaN;
        if (t !== null) clean.push(t);
        else if (!isBlank(rows[r][c] ?? "")) profile.coercionFailures++;
      }
      dateValues.set(c, typed);
      if (clean.length > 0) {
        const sorted = [...clean].sort((a, b) => a - b);
        const days = [...new Set(sorted.map((t) => Math.floor(t / 86400000)))];
        const gaps: number[] = [];
        for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
        profile.temporal = {
          min: new Date(sorted[0]).toISOString().slice(0, 10),
          max: new Date(sorted[sorted.length - 1]).toISOString().slice(0, 10),
          cadenceDays: gaps.length ? median(gaps) : 0,
          spanDays: Math.round((sorted[sorted.length - 1] - sorted[0]) / 86400000),
        };
      }
    } else if (kind === "category" || kind === "boolean") {
      const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      profile.categorical = {
        distinct,
        top: entries.slice(0, 12).map(([value, count]) => ({ value, count })),
        balance: balance(entries.map((e) => e[1])),
      };
    }

    columns.push(profile);
    collectColumnIssues(profile, rows, c, quality);
  }

  collectTableIssues(table, quality);
  return { columns, quality, numericValues, dateValues, dateOrders };
}

function collectColumnIssues(
  profile: ColumnProfile,
  rows: string[][],
  c: number,
  out: QualityIssue[],
) {
  const total = rows.length;
  if (total === 0) return;

  if (profile.missing > 0.05) {
    const refs: number[] = [];
    for (let r = 0; r < total && refs.length < LIMITS.auditRowCap; r++) {
      if (isBlank(rows[r][c] ?? "")) refs.push(r);
    }
    out.push({
      id: `missing:${profile.name}`,
      severity: profile.missing > 0.4 ? "high" : profile.missing > 0.15 ? "medium" : "low",
      column: profile.name,
      title: `${pct(profile.missing)} of ${profile.name} is empty`,
      detail:
        profile.missing > 0.4
          ? "Most rows have no value here. Any average over this column describes the minority that do."
          : "Gaps this size move an average without changing the row count, so totals and means disagree.",
      rowRefs: refs,
      affected: Math.round(profile.missing * total),
    });
  }

  if (profile.coercionFailures > 0) {
    const refs: number[] = [];
    for (let r = 0; r < total && refs.length < LIMITS.auditRowCap; r++) {
      const raw = rows[r][c] ?? "";
      if (isBlank(raw)) continue;
      const bad =
        profile.kind === "date"
          ? !looksLikeDate(raw)
          : parseNumber(raw) === null;
      if (bad) refs.push(r);
    }
    out.push({
      id: `mixed:${profile.name}`,
      severity: profile.coercionFailures / total > 0.02 ? "medium" : "low",
      column: profile.name,
      title: `${profile.coercionFailures.toLocaleString()} value${
        profile.coercionFailures === 1 ? "" : "s"
      } in ${profile.name} don't parse as ${profile.kind}`,
      detail:
        "Mixed types in one column. These rows are skipped by every calculation below, silently, unless you look.",
      rowRefs: refs,
      affected: profile.coercionFailures,
    });
  }

  // Case and whitespace variants split one real level into several.
  if (profile.kind === "category" && profile.categorical) {
    const canon = new Map<string, Set<string>>();
    for (const { value } of profile.categorical.top) {
      const key = value.trim().toLowerCase().replace(/\s+/g, " ");
      if (!canon.has(key)) canon.set(key, new Set());
      canon.get(key)!.add(value);
    }
    const collisions = [...canon.entries()].filter(([, set]) => set.size > 1);
    if (collisions.length > 0) {
      const variants = collisions.flatMap(([, set]) => [...set]);
      const refs: number[] = [];
      const want = new Set(variants);
      for (let r = 0; r < total && refs.length < LIMITS.auditRowCap; r++) {
        if (want.has((rows[r][c] ?? "").trim())) refs.push(r);
      }
      out.push({
        id: `variants:${profile.name}`,
        severity: "medium",
        column: profile.name,
        title: `${profile.name} has the same level spelled more than one way`,
        detail: `${variants
          .slice(0, 6)
          .map((v) => `"${v}"`)
          .join(", ")} differ only by case or spacing, so they group separately and each looks smaller than it is.`,
        rowRefs: refs,
        affected: refs.length,
      });
    }
  }

  if (profile.distinct === 1 && profile.missing < 1) {
    out.push({
      id: `constant:${profile.name}`,
      severity: "low",
      column: profile.name,
      title: `${profile.name} never changes`,
      detail: "One value in every row. It can't explain variation in anything else.",
      rowRefs: [],
      affected: total,
    });
  }
}

function collectTableIssues(table: Table, out: QualityIssue[]) {
  const { rows } = table;
  if (rows.length === 0) return;

  if (table.malformed > 0) {
    out.push({
      id: "malformed",
      severity: table.malformed / rows.length > 0.01 ? "high" : "low",
      title: `${table.malformed.toLocaleString()} row${
        table.malformed === 1 ? "" : "s"
      } didn't match the header width`,
      detail:
        "Padded or trimmed to fit. Usually an unescaped delimiter inside a field, which means those rows are shifted by a column.",
      rowRefs: [],
      affected: table.malformed,
    });
  }

  // Exact duplicates. Hashing the joined row keeps this linear.
  const seen = new Map<string, number>();
  const dupes: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    const key = rows[r].join("\u0001");
    const first = seen.get(key);
    if (first === undefined) seen.set(key, r);
    else dupes.push(r);
  }
  if (dupes.length > 0) {
    out.push({
      id: "duplicates",
      severity: dupes.length / rows.length > 0.02 ? "high" : "medium",
      title: `${dupes.length.toLocaleString()} exact duplicate row${
        dupes.length === 1 ? "" : "s"
      }`,
      detail:
        "Identical across every column. Each one double-counts in sums and drags averages toward its own value.",
      rowRefs: dupes.slice(0, LIMITS.auditRowCap),
      affected: dupes.length,
    });
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}
