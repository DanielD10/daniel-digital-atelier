/**
 * NEXUS — shared vocabulary.
 *
 * The whole system is one pipeline: bytes → table → profile → findings
 * → narrative. Each stage only reads the stage before it, which is what
 * makes the thing auditable: a finding can always be walked back to the
 * rows that produced it, because it carries their indices.
 */

/** What a column holds, decided by evidence rather than by the header. */
export type ColumnKind =
  | "number"
  | "integer"
  | "currency"
  | "percent"
  | "date"
  | "boolean"
  | "category"
  | "identifier"
  | "text"
  | "empty";

/** A parsed table. Values stay as strings; typed views come from the profile. */
export interface Table {
  headers: string[];
  rows: string[][];
  /** Rows dropped during parse because their arity didn't match the header. */
  malformed: number;
}

export interface NumericSummary {
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Median absolute deviation, scaled to be comparable with a standard deviation. */
  mad: number;
  stdev: number;
  q1: number;
  q3: number;
  sum: number;
  /** Fences at median ± 3·MAD. Robust, so a few wild values don't hide the rest. */
  outlierCount: number;
  /** 24-bucket density, for the inline histogram. */
  histogram: number[];
}

export interface DateSummary {
  min: string;
  max: string;
  /** Median gap between consecutive distinct days, in days. */
  cadenceDays: number;
  spanDays: number;
}

export interface CategorySummary {
  distinct: number;
  /** Most common levels, descending. Capped — a profile is not a data dump. */
  top: Array<{ value: string; count: number }>;
  /** Normalised Shannon entropy, 0 (one level) → 1 (perfectly even). */
  balance: number;
}

export interface ColumnProfile {
  name: string;
  index: number;
  kind: ColumnKind;
  /** Share of rows that are null/blank, 0–1. */
  missing: number;
  distinct: number;
  /** Set when the column parses cleanly as a number. */
  numeric?: NumericSummary;
  /** Set for date columns. */
  temporal?: DateSummary;
  /** Set for categoricals. */
  categorical?: CategorySummary;
  /** Rows that failed to parse as the inferred kind. */
  coercionFailures: number;
  /** A few real values, for the UI to show rather than describe. */
  sample: string[];
}

/** A problem with the data itself, found before any analysis runs. */
export interface QualityIssue {
  id: string;
  severity: "high" | "medium" | "low";
  column?: string;
  title: string;
  detail: string;
  /** Rows exhibiting the issue. Capped; `affected` carries the true count. */
  rowRefs: number[];
  affected: number;
}

export type FindingKind =
  | "shift"
  | "trend"
  | "outlier"
  | "relationship"
  | "concentration"
  | "paradox"
  | "gap"
  | "imbalance";

/**
 * A claim about the data, with everything needed to check it.
 *
 * `evidence` is the arithmetic in plain numbers, `rowRefs` the rows it
 * came from. Nothing in a finding is generated prose — the narration
 * layer reads these fields, it never invents them.
 */
export interface Finding {
  id: string;
  kind: FindingKind;
  /** Short, literal headline. Templated from the numbers, not written by a model. */
  headline: string;
  columns: string[];
  /** 0–1. Effect size × coverage × confidence × recency. Drives the ranking. */
  impact: number;
  /** 0–1 statistical confidence, used for both ranking and the UI's hedging. */
  confidence: number;
  /** Share of rows the claim is about, 0–1. */
  coverage: number;
  evidence: Record<string, number | string>;
  /** Indices into `Table.rows`. Capped at AUDIT_ROW_CAP. */
  rowRefs: number[];
  /** Optional series for the finding's inline chart. */
  series?: { labels: string[]; values: number[]; markerIndex?: number };
  /** Optional paired comparison for before/after and segment breakdowns. */
  breakdown?: Array<{ label: string; value: number; weight?: number }>;
  /**
   * Sampled point pairs for a relationship finding. An r value is a
   * summary that hides its own shape — the same 0.6 can be a cloud, a
   * curve, or a straight line with two leverage points dragging it — so
   * the card shows the cloud and lets the reader disagree.
   */
  scatter?: { x: number[]; y: number[]; xLabel: string; yLabel: string };
}

export interface Analysis {
  table: { rows: number; columns: number; malformed: number };
  columns: ColumnProfile[];
  quality: QualityIssue[];
  findings: Finding[];
  /** Milliseconds the engine spent, surfaced in the UI as an honest cost. */
  elapsedMs: number;
}

export interface DatasetRecord {
  id: string;
  name: string;
  source: "upload" | "demo";
  rowCount: number;
  columnCount: number;
  byteSize: number;
  columns: ColumnProfile[];
  quality: QualityIssue[];
  findings: Finding[];
  narrative: string | null;
  createdAt: string;
}

/** Hard ceilings. A portfolio page should not be a free compute endpoint. */
export const LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 100_000,
  maxColumns: 80,
  /*
   * Cited rows per finding. The panel never displays more than this, and
   * every finding ships its refs inside the server-rendered payload, so
   * a larger cap buys nothing but kilobytes on the wire. True magnitudes
   * live in `coverage` and `affected`, which are counts rather than lists.
   */
  auditRowCap: 60,
  maxFindings: 24,
} as const;
