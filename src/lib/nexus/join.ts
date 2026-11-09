import { humanize } from "./plain";
import type { Table } from "./types";

/**
 * Join two files into one table.
 *
 * Every interesting business question spans tables. Jobs and invoices.
 * Claims and payments. Wells and production. A tool that only reads
 * one file at a time can tell you that margin fell; it cannot tell you
 * that margin fell on the jobs a particular supplier touched, because
 * the supplier lives in the other export.
 *
 * The key is detected rather than asked for. People do not know, or
 * agree on, what their key column is called — `job_id` in one system
 * is `JobNumber` in the next — so matching is on the values, with the
 * column name used only as a tiebreak. A key is a column whose values
 * appear in both files, are near-unique on at least one side, and
 * cover enough of the other side to be worth joining on.
 */

export interface JoinCandidate {
  leftColumn: string;
  rightColumn: string;
  /** Share of left rows that find a match, 0–1. */
  coverage: number;
  /** True when the right side has at most one row per key. */
  rightIsUnique: boolean;
  /** 0–1, combining coverage, uniqueness and name agreement. */
  score: number;
  matchedKeys: number;
}

export interface JoinResult {
  table: Table;
  used: JoinCandidate;
  /** Left rows with no match on the right. Kept, with blanks. */
  unmatched: number;
  /** Right columns added, after any renaming for collisions. */
  added: string[];
}

/** Values normalised before comparison: keys differ in case and padding. */
function norm(v: string): string {
  return v.trim().toLowerCase();
}

/** Columns worth testing as a key: not blank, not obviously a measure. */
function keyable(table: Table, col: number): Set<string> | null {
  const seen = new Set<string>();
  let blank = 0;
  for (const row of table.rows) {
    const v = norm(row[col] ?? "");
    if (!v) {
      blank++;
      continue;
    }
    seen.add(v);
  }
  if (table.rows.length === 0) return null;
  if (blank / table.rows.length > 0.3) return null;
  // One value, or a value per row with only a handful of rows, is no key.
  if (seen.size < 2) return null;
  return seen;
}

export function findJoinKeys(left: Table, right: Table): JoinCandidate[] {
  const out: JoinCandidate[] = [];

  const rightSets = new Map<number, Set<string>>();
  for (let c = 0; c < right.headers.length; c++) {
    const s = keyable(right, c);
    if (s) rightSets.set(c, s);
  }

  for (let lc = 0; lc < left.headers.length; lc++) {
    const lSet = keyable(left, lc);
    if (!lSet) continue;

    for (const [rc, rSet] of rightSets) {
      // Overlap of distinct values, measured against the smaller side.
      let shared = 0;
      const small = lSet.size <= rSet.size ? lSet : rSet;
      const large = small === lSet ? rSet : lSet;
      for (const v of small) if (large.has(v)) shared++;
      if (shared < 2) continue;

      const overlap = shared / small.size;
      if (overlap < 0.5) continue;

      // How many LEFT rows would actually find a partner.
      let matched = 0;
      for (const row of left.rows) {
        const v = norm(row[lc] ?? "");
        if (v && rSet.has(v)) matched++;
      }
      const coverage = left.rows.length === 0 ? 0 : matched / left.rows.length;
      if (coverage < 0.3) continue;

      const rightIsUnique = rSet.size === countNonBlank(right, rc);
      const namesAgree =
        norm(left.headers[lc]).replace(/[_\s-]/g, "") ===
        norm(right.headers[rc]).replace(/[_\s-]/g, "");

      /*
       * A one-to-many join multiplies rows and quietly double-counts
       * every measure on the left, so uniqueness on the right is
       * weighted heavily rather than treated as a nicety.
       */
      const score =
        coverage * 0.5 + overlap * 0.2 + (rightIsUnique ? 0.25 : 0) + (namesAgree ? 0.05 : 0);

      out.push({
        leftColumn: left.headers[lc],
        rightColumn: right.headers[rc],
        coverage,
        rightIsUnique,
        score,
        matchedKeys: shared,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

function countNonBlank(table: Table, col: number): number {
  let n = 0;
  for (const row of table.rows) if (norm(row[col] ?? "")) n++;
  return n;
}

export class JoinError extends Error {}

/**
 * Left join: every row of the first file is kept, with the second
 * file's columns appended where a key matches.
 *
 * Left rather than inner, because silently dropping rows that failed
 * to match would change every total on the page without saying so.
 * They are kept with blanks, and the count of them is reported — an
 * unmatched rate is often the most useful thing a join reveals.
 */
export function joinTables(
  left: Table,
  right: Table,
  candidate: JoinCandidate,
): JoinResult {
  const lc = left.headers.indexOf(candidate.leftColumn);
  const rc = right.headers.indexOf(candidate.rightColumn);
  if (lc < 0 || rc < 0) throw new JoinError("That key column isn't in both files any more.");

  // First match wins on a one-to-many key: duplicating left rows would
  // multiply every measure on them.
  const index = new Map<string, string[]>();
  for (const row of right.rows) {
    const v = norm(row[rc] ?? "");
    if (!v || index.has(v)) continue;
    index.set(v, row);
  }

  const taken = new Set(left.headers.map((h) => h.toLowerCase()));
  const addedCols: number[] = [];
  const added: string[] = [];
  for (let c = 0; c < right.headers.length; c++) {
    if (c === rc) continue; // The key itself is already on the left.
    let name = right.headers[c];
    if (taken.has(name.toLowerCase())) name = `${name} (2)`;
    taken.add(name.toLowerCase());
    addedCols.push(c);
    added.push(name);
  }

  const headers = [...left.headers, ...added];
  const rows: string[][] = [];
  let unmatched = 0;

  for (const row of left.rows) {
    const v = norm(row[lc] ?? "");
    const match = v ? index.get(v) : undefined;
    if (!match) unmatched++;
    rows.push([...row, ...addedCols.map((c) => (match ? match[c] ?? "" : ""))]);
  }

  return {
    table: { headers, rows, malformed: left.malformed + right.malformed },
    used: candidate,
    unmatched,
    added,
  };
}

/** One sentence describing what the join did, for the panel. */
export function describeJoin(r: JoinResult, leftName: string, rightName: string): string {
  const pct = ((1 - r.unmatched / Math.max(1, r.table.rows.length)) * 100).toFixed(
    r.unmatched === 0 ? 0 : 1,
  );
  const base =
    `Matched ${leftName} to ${rightName} on ${humanize(r.used.leftColumn)}` +
    (r.used.leftColumn !== r.used.rightColumn ? ` ↔ ${humanize(r.used.rightColumn)}` : "") +
    `, adding ${r.added.length} column${r.added.length === 1 ? "" : "s"}. ${pct}% of rows found a match.`;

  if (r.unmatched > 0) {
    return `${base} The ${r.unmatched.toLocaleString()} that didn't are kept with blanks — a high unmatched rate is usually worth looking at on its own.`;
  }
  if (!r.used.rightIsUnique) {
    return `${base} ${rightName} had more than one row per key, so the first was used for each — check that's what you want.`;
  }
  return base;
}
