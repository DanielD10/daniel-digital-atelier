import {
  changePoint,
  correlationP,
  ksP,
  ksStatistic,
  linearFit,
  mad,
  mean,
  median,
  pearson,
  spearman,
  topShare,
} from "./stats";
import type { ProfileResult } from "./profile";
import { LIMITS, type ColumnProfile, type Finding, type Table } from "./types";

/**
 * The detector battery.
 *
 * This is the part other tools leave to the person. A passive dashboard
 * waits to be asked; these run every reasonable question against the
 * table up front, score what they find, and let the ranking decide what
 * is worth a human's attention. Each detector returns findings carrying
 * their own arithmetic and row indices, so nothing downstream has to be
 * trusted — it can be checked.
 */

/** Correlation work is sampled above this many rows; the estimate is stable well before it. */
const CORRELATION_SAMPLE = 20_000;
/** Above this, pairwise scanning stops being worth the wall time. */
const MAX_NUMERIC_FOR_PAIRS = 24;

interface Ctx {
  table: Table;
  profile: ProfileResult;
  numericCols: ColumnProfile[];
  dateCols: ColumnProfile[];
  categoryCols: ColumnProfile[];
}

export function detectFindings(table: Table, profile: ProfileResult): Finding[] {
  const byKind = (...kinds: string[]) =>
    profile.columns.filter((c) => kinds.includes(c.kind));

  const ctx: Ctx = {
    table,
    profile,
    numericCols: byKind("number", "integer", "currency", "percent"),
    dateCols: byKind("date"),
    categoryCols: byKind("category", "boolean"),
  };

  const found: Finding[] = [
    ...detectShifts(ctx),
    ...detectTrends(ctx),
    ...detectParadoxes(ctx),
    ...detectMixShifts(ctx),
    ...detectSegmentGaps(ctx),
    ...detectRateGaps(ctx),
    ...detectRelationships(ctx),
    ...detectOutliers(ctx),
    ...detectConcentration(ctx),
    ...detectCalendarGaps(ctx),
  ];

  return rank(found);
}

/* ─────────────────────────── ranking ─────────────────────────── */

/**
 * Rank by impact, then thin out findings that say the same thing twice.
 *
 * Ranking is the whole product. Every tool can list anomalies; a list of
 * two hundred anomalies is just the spreadsheet again. Impact multiplies
 * how big the effect is by how much of the data it covers by how sure we
 * are of it, so a huge swing in 0.3% of rows loses to a moderate one
 * across half the table.
 */
function rank(findings: Finding[]): Finding[] {
  /*
   * Below this, a finding is technically true and practically noise —
   * seven mildly long shipping times out of six thousand rows. Printing
   * it costs more attention than it returns, and a panel that pads
   * itself teaches people to skim past the top of it.
   */
  const FLOOR = 0.05;
  const sorted = findings.filter((f) => f.impact >= FLOOR).sort((a, b) => b.impact - a.impact);
  const kept: Finding[] = [];
  const claimed = new Map<string, number>();

  for (const f of sorted) {
    // Allow two findings per column set, so a column can both shift and trend
    // without one column monopolising the whole panel.
    const key = `${f.kind}:${[...f.columns].sort().join("|")}`;
    const colKey = [...f.columns].sort().join("|");
    if (claimed.has(key)) continue;
    if ((claimed.get(colKey) ?? 0) >= 2) continue;
    claimed.set(key, 1);
    claimed.set(colKey, (claimed.get(colKey) ?? 0) + 1);
    kept.push(f);
    if (kept.length >= LIMITS.maxFindings) break;
  }
  return kept;
}

function score(parts: {
  effect: number;
  coverage: number;
  confidence: number;
  recency?: number;
}): number {
  const { effect, coverage, confidence, recency = 1 } = parts;
  const e = Math.min(1, Math.max(0, effect));
  const c = Math.min(1, Math.max(0, coverage));
  // Coverage is square-rooted: going from 1% to 25% of the data matters far
  // more than going from 50% to 100%, and a linear term buries small-but-real
  // segment findings under whole-table trivia.
  return e * Math.sqrt(c) * confidence * recency;
}

/* ──────────────────── time series helpers ───────────────────── */

interface Series {
  labels: string[];
  values: number[];
  /** Row indices contributing to each bucket. */
  buckets: number[][];
  /** How `values` were reduced from the rows — reported in every finding's evidence. */
  statistic: "median" | "count";
}

/** Choose a bucket that yields enough points to reason about without noise. */
function chooseGrain(spanDays: number): { grain: "day" | "week" | "month"; ms: number } {
  if (spanDays <= 90) return { grain: "day", ms: 86400000 };
  if (spanDays <= 730) return { grain: "week", ms: 7 * 86400000 };
  return { grain: "month", ms: 30 * 86400000 };
}

function bucketKey(t: number, grain: "day" | "week" | "month"): string {
  const d = new Date(t);
  if (grain === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (grain === "week") {
    const monday = new Date(t);
    const dow = (monday.getUTCDay() + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - dow);
    return monday.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate one numeric column over one date column.
 *
 * The bucket statistic is the MEDIAN, not the mean, and that choice is
 * the difference between a trustworthy panel and a useless one. An early
 * version of this used the mean and duly announced that units "rose 440%
 * and stayed there" — which was a handful of wholesale orders landing in
 * late buckets and dragging their averages, not a change in the
 * business. A tool that volunteers conclusions cannot afford a detector
 * whose own summary statistic is that easy to move.
 *
 * Medians rather than sums for the same reason a sum is the wrong
 * question anyway: a total conflates "each order got bigger" with "there
 * were more orders", and those call for completely different responses.
 * Row volume is tracked separately as its own counting series.
 */
function buildSeries(
  ctx: Ctx,
  dateCol: ColumnProfile,
  numCol: ColumnProfile | null,
  rowFilter?: (r: number) => boolean,
): Series | null {
  const dates = ctx.profile.dateValues.get(dateCol.index);
  if (!dates || !dateCol.temporal) return null;
  const nums = numCol ? ctx.profile.numericValues.get(numCol.index) : null;
  if (numCol && !nums) return null;

  const { grain } = chooseGrain(dateCol.temporal.spanDays);
  const groups = new Map<string, { values: number[]; n: number; rows: number[] }>();

  for (let r = 0; r < ctx.table.rows.length; r++) {
    if (rowFilter && !rowFilter(r)) continue;
    const t = dates[r];
    if (t === null) continue;
    let v = 1;
    if (nums) {
      const n = nums[r];
      if (n === null) continue;
      v = n;
    }
    const key = bucketKey(t, grain);
    const g = groups.get(key);
    if (g) {
      if (nums) g.values.push(v);
      g.n++;
      if (g.rows.length < 64) g.rows.push(r);
    } else {
      groups.set(key, { values: nums ? [v] : [], n: 1, rows: [r] });
    }
  }

  const labels = [...groups.keys()].sort();
  if (labels.length < 6) return null;
  return {
    labels,
    values: labels.map((l) => (nums ? median(groups.get(l)!.values) : groups.get(l)!.n)),
    buckets: labels.map((l) => groups.get(l)!.rows),
    statistic: nums ? "median" : "count",
  };
}

/** Residual sum of squares for a two-segment step model split at `index`. */
function stepRss(values: number[], index: number): number {
  const before = values.slice(0, index);
  const after = values.slice(index);
  const mb = mean(before);
  const ma = mean(after);
  let rss = 0;
  for (const v of before) rss += (v - mb) ** 2;
  for (const v of after) rss += (v - ma) ** 2;
  return rss;
}

/** Residual sum of squares for a straight line through the series. */
function linearRss(values: number[]): number {
  const xs = values.map((_, i) => i);
  const fit = linearFit(xs, values);
  let rss = 0;
  for (let i = 0; i < values.length; i++) {
    rss += (values[i] - (fit.intercept + fit.slope * i)) ** 2;
  }
  return rss;
}

function rowsFor(series: Series, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to && i < series.buckets.length; i++) {
    for (const r of series.buckets[i]) {
      if (out.length >= LIMITS.auditRowCap) return out;
      out.push(r);
    }
  }
  return out;
}

/* ───────────────────────── detectors ────────────────────────── */

/** A level change: the series ran at one level, then another. */
function detectShifts(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  for (const dateCol of ctx.dateCols.slice(0, 2)) {
    const targets: Array<ColumnProfile | null> = [null, ...ctx.numericCols.slice(0, 8)];
    for (const numCol of targets) {
      const series = buildSeries(ctx, dateCol, numCol);
      if (!series) continue;

      const cp = changePoint(series.values);
      if (!cp || cp.magnitude < 3) continue;

      /*
       * A median over a small-integer column is a coarse instrument. If
       * units per order are mostly 1–3, its weekly median moving from 2
       * to 1 reads as a 50% collapse, when all that happened is the
       * underlying average crossing a rounding boundary. A step of one
       * unit is the smallest value such a column can express, so it is
       * never evidence on its own; two units is a real move.
       *
       * Counting the series' distinct values would be the obvious guard
       * and is exactly wrong — a clean step function has two.
       */
      if (numCol?.kind === "integer" && Math.abs(cp.after - cp.before) < 2) continue;

      const rel = cp.before === 0 ? 1 : Math.abs(cp.after - cp.before) / Math.abs(cp.before);
      if (rel < 0.08) continue;

      /*
       * The mirror of the check in detectTrends. A smooth ramp always
       * has a "best" split point, and reporting one turns a gradual mix
       * shift into a dated event that never happened. Where a straight
       * line accounts for the series materially better than a step, the
       * trend detector owns this column.
       */
      const stepFit = stepRss(series.values, cp.index);
      const lineFit = linearRss(series.values);
      if (stepFit > 0 && lineFit < stepFit * 0.85) continue;

      const label = numCol ? numCol.name : "row volume";
      const dir = cp.after > cp.before ? "rose" : "fell";
      const confidence = Math.min(1, cp.magnitude / 8);
      // Later breaks matter more — a step two years ago is history.
      const recency = 0.6 + 0.4 * (cp.index / series.values.length);

      out.push({
        id: `shift:${dateCol.name}:${label}`,
        kind: "shift",
        headline: `${cap(label)} ${dir} ${fmtPct(rel)} at ${series.labels[cp.index]} and stayed there`,
        columns: numCol ? [dateCol.name, numCol.name] : [dateCol.name],
        impact: score({ effect: Math.min(1, rel / 0.5), coverage: 1, confidence, recency }),
        confidence,
        coverage: 1,
        evidence: {
          before: round(cp.before),
          after: round(cp.after),
          change: round(cp.after - cp.before),
          relativeChangePct: round(rel * 100, 1),
          breakAt: series.labels[cp.index],
          sigmas: round(cp.magnitude, 2),
          periodsBefore: cp.index,
          periodsAfter: series.values.length - cp.index,
          statistic: `per-${chooseGrain(dateCol.temporal!.spanDays).grain} ${series.statistic}`,
        },
        rowRefs: rowsFor(series, Math.max(0, cp.index - 2), cp.index + 4),
        series: { labels: series.labels, values: series.values.map((v) => round(v)), markerIndex: cp.index },
        breakdown: [
          { label: `Before ${series.labels[cp.index]}`, value: round(cp.before) },
          { label: `After`, value: round(cp.after) },
        ],
      });
    }
  }
  return out;
}

/** A sustained direction, as opposed to a single step. */
function detectTrends(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  for (const dateCol of ctx.dateCols.slice(0, 2)) {
    const targets: Array<ColumnProfile | null> = [null, ...ctx.numericCols.slice(0, 8)];
    for (const numCol of targets) {
      const series = buildSeries(ctx, dateCol, numCol);
      if (!series) continue;
      const xs = series.values.map((_, i) => i);
      const fit = linearFit(xs, series.values);
      if (fit.r2 < 0.35) continue;

      /*
       * A step function fits a straight line surprisingly well, so
       * without this the engine describes a one-off carrier change as a
       * gradual 219% drift — true of the line it fitted, false about the
       * world. Where a two-segment step leaves materially less residual
       * than a line, the shift detector already has the better account
       * of this column and the trend is suppressed rather than printed
       * beside it.
       */
      const cp = changePoint(series.values);
      if (cp && cp.magnitude >= 3) {
        const lin = linearRss(series.values);
        if (lin > 0 && stepRss(series.values, cp.index) < lin * 0.85) continue;
      }

      const first = fit.intercept;
      const last = fit.intercept + fit.slope * (series.values.length - 1);
      if (first === 0) continue;
      const total = (last - first) / Math.abs(first);
      if (Math.abs(total) < 0.12) continue;

      const label = numCol ? numCol.name : "row volume";
      // Hedge the wording to the fit. "Steadily" is a claim about scatter.
      const manner = fit.r2 >= 0.7 ? "steadily across" : "on balance over";
      out.push({
        id: `trend:${dateCol.name}:${label}`,
        kind: "trend",
        headline: `${cap(label)} has moved ${total > 0 ? "up" : "down"} ${fmtPct(
          Math.abs(total),
        )} ${manner} the window`,
        columns: numCol ? [dateCol.name, numCol.name] : [dateCol.name],
        impact: score({
          effect: Math.min(1, Math.abs(total) / 0.75),
          coverage: 1,
          confidence: fit.r2,
        }),
        confidence: fit.r2,
        coverage: 1,
        evidence: {
          start: round(first),
          end: round(last),
          totalChangePct: round(total * 100, 1),
          perPeriod: round(fit.slope),
          rSquared: round(fit.r2, 3),
          periods: series.values.length,
          statistic: `per-${chooseGrain(dateCol.temporal!.spanDays).grain} ${series.statistic}`,
        },
        rowRefs: rowsFor(series, series.values.length - 4, series.values.length),
        series: { labels: series.labels, values: series.values.map((v) => round(v)) },
      });
    }
  }
  return out;
}

/**
 * Simpson's paradox: the whole moves one way while every part moves the
 * other.
 *
 * This is the finding that justifies the entire approach. It is invisible
 * on a passive dashboard — the headline number looks healthy, each
 * segment chart looks unremarkable on its own, and nobody thinks to put
 * them side by side. It takes a tool that is actively looking.
 */
function detectParadoxes(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  if (ctx.dateCols.length === 0) return out;
  const dateCol = ctx.dateCols[0];
  const dates = ctx.profile.dateValues.get(dateCol.index);
  if (!dates) return out;

  for (const numCol of ctx.numericCols.slice(0, 6)) {
    const nums = ctx.profile.numericValues.get(numCol.index);
    if (!nums) continue;

    const overall = buildSeries(ctx, dateCol, numCol);
    if (!overall) continue;
    const mid = Math.floor(overall.values.length / 2);
    const overallBefore = mean(overall.values.slice(0, mid));
    const overallAfter = mean(overall.values.slice(mid));
    if (overallBefore === 0) continue;
    const overallDelta = (overallAfter - overallBefore) / Math.abs(overallBefore);
    if (Math.abs(overallDelta) < 0.03) continue;

    const cutoff = quantileOf(dates, 0.5);
    if (cutoff === null) continue;

    for (const catCol of ctx.categoryCols.slice(0, 6)) {
      if (!catCol.categorical || catCol.categorical.distinct < 2) continue;
      if (catCol.categorical.distinct > 12) continue;

      const segments: Array<{ label: string; delta: number; weight: number }> = [];
      for (const { value } of catCol.categorical.top) {
        let sumB = 0;
        let nB = 0;
        let sumA = 0;
        let nA = 0;
        for (let r = 0; r < ctx.table.rows.length; r++) {
          if ((ctx.table.rows[r][catCol.index] ?? "").trim() !== value) continue;
          const v = nums[r];
          const t = dates[r];
          if (v === null || t === null) continue;
          if (t < cutoff) {
            sumB += v;
            nB++;
          } else {
            sumA += v;
            nA++;
          }
        }
        if (nB < 5 || nA < 5) continue;
        const mb = sumB / nB;
        const ma = sumA / nA;
        if (mb === 0) continue;
        segments.push({ label: value, delta: (ma - mb) / Math.abs(mb), weight: nB + nA });
      }
      if (segments.length < 2) continue;

      const totalWeight = segments.reduce((a, s) => a + s.weight, 0);
      const against = segments.filter((s) => Math.sign(s.delta) !== Math.sign(overallDelta));
      const againstWeight = against.reduce((a, s) => a + s.weight, 0);
      const share = againstWeight / totalWeight;
      // Demand near-unanimity: a genuine paradox has the parts agreeing with
      // each other and disagreeing with the total.
      if (share < 0.8 || against.length < segments.length - 1) continue;
      /*
       * Two-level splits need every level to disagree with the total.
       * With only two segments, "almost every" means one, and one
       * segment moving against a total it is half of is arithmetic
       * rather than a paradox.
       */
      if (segments.length < 3 && against.length < segments.length) continue;

      const refs: number[] = [];
      for (let r = 0; r < ctx.table.rows.length && refs.length < LIMITS.auditRowCap; r++) {
        if (nums[r] !== null && dates[r] !== null) refs.push(r);
      }

      out.push({
        id: `paradox:${numCol.name}:${catCol.name}`,
        kind: "paradox",
        headline: `${cap(numCol.name)} is ${overallDelta > 0 ? "up" : "down"} ${fmtPct(
          Math.abs(overallDelta),
        )} overall while ${segmentPhrase(catCol, against.length, segments.length)} moved the other way`,
        columns: [dateCol.name, numCol.name, catCol.name],
        impact: score({
          effect: 1,
          coverage: 1,
          confidence: Math.min(1, 0.65 + share * 0.35),
        }),
        confidence: Math.min(1, 0.65 + share * 0.35),
        coverage: 1,
        evidence: {
          overallChangePct: round(overallDelta * 100, 1),
          segmentsAgainst: against.length,
          segmentsTotal: segments.length,
          rowShareAgainstPct: round(share * 100, 1),
          explanation: `The mix shifted toward ${catCol.name} levels that sit at a different ${numCol.name}, so the total moved without any segment doing so.`,
        },
        rowRefs: refs,
        breakdown: [
          { label: "Overall", value: round(overallDelta * 100, 1) },
          ...segments.map((s) => ({
            label: s.label,
            value: round(s.delta * 100, 1),
            weight: s.weight,
          })),
        ],
      });
    }
  }
  return out;
}

/** The composition of a categorical changed between the halves of the window. */
function detectMixShifts(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  if (ctx.dateCols.length === 0) return out;
  const dateCol = ctx.dateCols[0];
  const dates = ctx.profile.dateValues.get(dateCol.index);
  if (!dates) return out;
  const cutoff = quantileOf(dates, 0.5);
  if (cutoff === null) return out;

  for (const catCol of ctx.categoryCols.slice(0, 8)) {
    if (!catCol.categorical || catCol.categorical.distinct < 2 || catCol.categorical.distinct > 20) {
      continue;
    }
    const before = new Map<string, number>();
    const after = new Map<string, number>();
    let nB = 0;
    let nA = 0;
    for (let r = 0; r < ctx.table.rows.length; r++) {
      const t = dates[r];
      if (t === null) continue;
      const v = (ctx.table.rows[r][catCol.index] ?? "").trim();
      if (!v) continue;
      if (t < cutoff) {
        before.set(v, (before.get(v) ?? 0) + 1);
        nB++;
      } else {
        after.set(v, (after.get(v) ?? 0) + 1);
        nA++;
      }
    }
    if (nB < 30 || nA < 30) continue;

    let biggest = { label: "", delta: 0, from: 0, to: 0 };
    for (const level of new Set([...before.keys(), ...after.keys()])) {
      const pb = (before.get(level) ?? 0) / nB;
      const pa = (after.get(level) ?? 0) / nA;
      if (Math.abs(pa - pb) > Math.abs(biggest.delta)) {
        biggest = { label: level, delta: pa - pb, from: pb, to: pa };
      }
    }
    if (Math.abs(biggest.delta) < 0.06) continue;

    const refs: number[] = [];
    for (let r = 0; r < ctx.table.rows.length && refs.length < LIMITS.auditRowCap; r++) {
      const t = dates[r];
      if (t !== null && t >= cutoff && (ctx.table.rows[r][catCol.index] ?? "").trim() === biggest.label) {
        refs.push(r);
      }
    }

    const confidence = Math.min(1, Math.abs(biggest.delta) / 0.2);
    out.push({
      id: `mix:${catCol.name}`,
      kind: "imbalance",
      headline: `${biggest.label} went from ${fmtPct(biggest.from)} to ${fmtPct(
        biggest.to,
      )} of all rows`,
      columns: [dateCol.name, catCol.name],
      impact: score({
        effect: Math.min(1, Math.abs(biggest.delta) / 0.3),
        coverage: Math.max(biggest.from, biggest.to),
        confidence,
      }),
      confidence,
      coverage: Math.max(biggest.from, biggest.to),
      evidence: {
        level: biggest.label,
        shareBeforePct: round(biggest.from * 100, 1),
        shareAfterPct: round(biggest.to * 100, 1),
        pointChangePct: round(biggest.delta * 100, 1),
        rowsBefore: nB,
        rowsAfter: nA,
      },
      rowRefs: refs,
      breakdown: [...new Set([...before.keys(), ...after.keys()])]
        .map((level) => ({
          label: level,
          value: round((((after.get(level) ?? 0) / nA) - ((before.get(level) ?? 0) / nB)) * 100, 1),
        }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 8),
    });
  }
  return out;
}

/** One segment's distribution of a metric differs from the rest of the table. */
function detectSegmentGaps(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  for (const catCol of ctx.categoryCols.slice(0, 6)) {
    if (!catCol.categorical || catCol.categorical.distinct < 2 || catCol.categorical.distinct > 20) {
      continue;
    }
    for (const numCol of ctx.numericCols.slice(0, 6)) {
      const nums = ctx.profile.numericValues.get(numCol.index);
      if (!nums) continue;

      const groups = new Map<string, number[]>();
      for (let r = 0; r < ctx.table.rows.length; r++) {
        const v = nums[r];
        if (v === null) continue;
        const k = (ctx.table.rows[r][catCol.index] ?? "").trim();
        if (!k) continue;
        const g = groups.get(k);
        if (g) g.push(v);
        else groups.set(k, [v]);
      }
      if (groups.size < 2) continue;

      const all: number[] = [];
      for (const vs of groups.values()) all.push(...vs);
      const globalMedian = median(all);
      const spread = mad(all);
      if (spread === 0) continue;

      let worst: { label: string; d: number; p: number; med: number; n: number } | null = null;
      for (const [label, vs] of groups) {
        if (vs.length < 15) continue;
        const rest = all.length - vs.length;
        if (rest < 15) continue;
        const others: number[] = [];
        for (const [l2, v2] of groups) if (l2 !== label) others.push(...v2);
        const d = ksStatistic(vs, others);
        const p = ksP(d, vs.length, others.length);
        if (p > 0.01) continue;
        if (!worst || d > worst.d) worst = { label, d, p, med: median(vs), n: vs.length };
      }
      if (!worst || worst.d < 0.25) continue;

      const gap = (worst.med - globalMedian) / spread;
      if (Math.abs(gap) < 0.4) continue;

      const refs: number[] = [];
      for (let r = 0; r < ctx.table.rows.length && refs.length < LIMITS.auditRowCap; r++) {
        if ((ctx.table.rows[r][catCol.index] ?? "").trim() === worst.label && nums[r] !== null) {
          refs.push(r);
        }
      }
      const coverage = worst.n / all.length;
      const confidence = Math.min(1, worst.d / 0.6);

      out.push({
        id: `segment:${catCol.name}:${numCol.name}`,
        kind: "relationship",
        headline: `${worst.label} runs ${fmtPct(
          Math.abs(worst.med - globalMedian) / Math.max(1e-9, Math.abs(globalMedian)),
        )} ${worst.med > globalMedian ? "above" : "below"} everything else on ${numCol.name}`,
        columns: [catCol.name, numCol.name],
        impact: score({ effect: Math.min(1, worst.d / 0.5), coverage, confidence }),
        confidence,
        coverage,
        evidence: {
          segment: worst.label,
          segmentMedian: round(worst.med),
          overallMedian: round(globalMedian),
          robustGap: round(gap, 2),
          ksStatistic: round(worst.d, 3),
          pValue: worst.p < 1e-4 ? "<0.0001" : round(worst.p, 4),
          rowsInSegment: worst.n,
        },
        rowRefs: refs,
        breakdown: [...groups.entries()]
          .filter(([, vs]) => vs.length >= 5)
          .map(([label, vs]) => ({ label, value: round(median(vs)), weight: vs.length }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8),
      });
    }
  }
  return out;
}

const TRUE_TOKENS = new Set(["true", "yes", "y", "t", "1"]);

/**
 * Rates of a yes/no column, broken down by segment.
 *
 * "What share of X is true, and is it different here than elsewhere" —
 * return rate by region, churn by plan, conversion by channel — is
 * probably the most-asked question in commercial analytics, and a
 * boolean column is invisible to every numeric detector above. The test
 * is a two-proportion z, so a 40% rate over twenty rows doesn't outrank
 * a 9% rate over nine thousand.
 */
function detectRateGaps(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  const boolCols = ctx.profile.columns.filter((c) => c.kind === "boolean");

  for (const flag of boolCols.slice(0, 4)) {
    for (const catCol of ctx.categoryCols.slice(0, 8)) {
      if (catCol.index === flag.index) continue;
      if (!catCol.categorical || catCol.categorical.distinct < 2) continue;
      if (catCol.categorical.distinct > 20) continue;

      const groups = new Map<string, { hits: number; n: number }>();
      let totalHits = 0;
      let totalN = 0;
      for (let r = 0; r < ctx.table.rows.length; r++) {
        const raw = (ctx.table.rows[r][flag.index] ?? "").trim().toLowerCase();
        if (!raw) continue;
        const level = (ctx.table.rows[r][catCol.index] ?? "").trim();
        if (!level) continue;
        const hit = TRUE_TOKENS.has(raw) ? 1 : 0;
        const g = groups.get(level);
        if (g) {
          g.hits += hit;
          g.n++;
        } else groups.set(level, { hits: hit, n: 1 });
        totalHits += hit;
        totalN++;
      }
      if (totalN < 60 || groups.size < 2) continue;

      let worst: { label: string; rate: number; rest: number; n: number; z: number } | null = null;
      for (const [label, g] of groups) {
        if (g.n < 30) continue;
        const restN = totalN - g.n;
        const restHits = totalHits - g.hits;
        if (restN < 30) continue;
        const p1 = g.hits / g.n;
        const p0 = restHits / restN;
        const pooled = (g.hits + restHits) / (g.n + restN);
        const se = Math.sqrt(pooled * (1 - pooled) * (1 / g.n + 1 / restN));
        if (se === 0) continue;
        const z = Math.abs(p1 - p0) / se;
        if (!worst || z > worst.z) worst = { label, rate: p1, rest: p0, n: g.n, z };
      }
      // z ≈ 4 is p < 0.0001; this panel should not be reporting marginal calls.
      if (!worst || worst.z < 4) continue;
      const absGap = Math.abs(worst.rate - worst.rest);
      if (absGap < 0.03) continue;

      const refs: number[] = [];
      for (let r = 0; r < ctx.table.rows.length && refs.length < LIMITS.auditRowCap; r++) {
        if (
          (ctx.table.rows[r][catCol.index] ?? "").trim() === worst.label &&
          TRUE_TOKENS.has((ctx.table.rows[r][flag.index] ?? "").trim().toLowerCase())
        ) {
          refs.push(r);
        }
      }

      const coverage = worst.n / totalN;
      const confidence = Math.min(1, worst.z / 10);
      const times = worst.rest === 0 ? 0 : worst.rate / worst.rest;

      out.push({
        id: `rate:${flag.name}:${catCol.name}`,
        kind: "imbalance",
        headline: `${worst.label} is ${fmtPct(worst.rate)} ${flag.name}${
          times >= 1.5 ? ` — ${times.toFixed(1)}× the rest` : ""
        }`,
        columns: [catCol.name, flag.name],
        impact: score({ effect: Math.min(1, absGap / 0.2), coverage, confidence }),
        confidence,
        coverage,
        evidence: {
          segment: worst.label,
          segmentRatePct: round(worst.rate * 100, 1),
          everyoneElsePct: round(worst.rest * 100, 1),
          pointGapPct: round(absGap * 100, 1),
          rowsInSegment: worst.n,
          zScore: round(worst.z, 1),
          note: "Two-proportion z-test against the rest of the table, so segment size is already priced in.",
        },
        rowRefs: refs,
        breakdown: [...groups.entries()]
          .filter(([, g]) => g.n >= 15)
          .map(([label, g]) => ({ label, value: round((g.hits / g.n) * 100, 1), weight: g.n }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
      });
    }
  }
  return out;
}

/** Pairwise association between numeric columns. */
function detectRelationships(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  const cols = ctx.numericCols.slice(0, MAX_NUMERIC_FOR_PAIRS);
  const total = ctx.table.rows.length;
  const step = total > CORRELATION_SAMPLE ? Math.ceil(total / CORRELATION_SAMPLE) : 1;

  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const a = ctx.profile.numericValues.get(cols[i].index);
      const b = ctx.profile.numericValues.get(cols[j].index);
      if (!a || !b) continue;

      const xs: number[] = [];
      const ys: number[] = [];
      const refs: number[] = [];
      for (let r = 0; r < total; r += step) {
        const x = a[r];
        const y = b[r];
        if (x === null || y === null) continue;
        xs.push(x);
        ys.push(y);
        if (refs.length < LIMITS.auditRowCap) refs.push(r);
      }
      if (xs.length < 30) continue;

      const r1 = pearson(xs, ys);
      const r2 = spearman(xs, ys);
      // Take whichever reads stronger: linear misses curves, rank misses
      // nothing but says less about magnitude.
      const r = Math.abs(r2) > Math.abs(r1) ? r2 : r1;
      if (Math.abs(r) < 0.45) continue;
      const p = correlationP(r, xs.length);
      if (p > 0.001) continue;

      const coverage = xs.length / Math.max(1, Math.ceil(total / step));
      const confidence = Math.min(1, Math.abs(r));

      out.push({
        id: `rel:${cols[i].name}:${cols[j].name}`,
        kind: "relationship",
        headline: `${cols[i].name} and ${cols[j].name} move ${
          r > 0 ? "together" : "in opposite directions"
        } (r = ${r.toFixed(2)})`,
        columns: [cols[i].name, cols[j].name],
        impact: score({ effect: Math.min(1, (Math.abs(r) - 0.4) / 0.5), coverage, confidence }),
        confidence,
        coverage,
        evidence: {
          pearson: round(r1, 3),
          spearman: round(r2, 3),
          pValue: p < 1e-4 ? "<0.0001" : round(p, 4),
          pairs: xs.length,
          note: "Association, not cause. Both may follow something absent from this table.",
        },
        rowRefs: refs,
        scatter: sampleScatter(xs, ys, cols[i].name, cols[j].name),
      });
    }
  }
  return out;
}

/** Values far enough from the centre to distort any average over them. */
function detectOutliers(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  for (const col of ctx.numericCols.slice(0, 12)) {
    const s = col.numeric;
    const nums = ctx.profile.numericValues.get(col.index);
    if (!s || !nums || s.mad === 0 || s.outlierCount === 0) continue;

    const total = ctx.table.rows.length;
    const share = s.outlierCount / Math.max(1, total);
    if (share > 0.1) continue; // Not outliers — that's the distribution.

    const fence = 3 * s.mad;
    const refs: number[] = [];
    let extreme = 0;
    let carried = 0;
    for (let r = 0; r < total; r++) {
      const v = nums[r];
      if (v === null) continue;
      const dev = Math.abs(v - s.median);
      if (dev > fence) {
        if (refs.length < LIMITS.auditRowCap) refs.push(r);
        if (dev > Math.abs(extreme - s.median)) extreme = v;
        carried += v;
      }
    }
    // The number that matters is not how many, but how much they move the mean.
    const pull = s.sum === 0 ? 0 : Math.abs(carried / s.sum);
    if (pull < 0.03 && s.outlierCount < 5) continue;

    const confidence = Math.min(1, Math.abs(extreme - s.median) / (6 * s.mad));
    out.push({
      id: `outlier:${col.name}`,
      kind: "outlier",
      headline: `${s.outlierCount.toLocaleString()} extreme ${
        s.outlierCount === 1 ? "value" : "values"
      } in ${col.name} carry ${fmtPct(pull)} of its total`,
      columns: [col.name],
      impact: score({ effect: Math.min(1, pull / 0.3), coverage: Math.max(share, 0.01), confidence }),
      confidence,
      coverage: share,
      evidence: {
        median: round(s.median),
        mean: round(s.mean),
        mad: round(s.mad),
        fenceAbove: round(s.median + fence),
        fenceBelow: round(s.median - fence),
        mostExtreme: round(extreme),
        shareOfTotalPct: round(pull * 100, 1),
        count: s.outlierCount,
        note: "Fences are median ± 3·MAD, so the outliers aren't setting their own threshold.",
      },
      rowRefs: refs,
    });
  }
  return out;
}

/** A handful of levels accounting for nearly everything. */
function detectConcentration(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  for (const col of ctx.categoryCols.slice(0, 8)) {
    const c = col.categorical;
    if (!c || c.distinct < 4) continue;
    const counts = c.top.map((t) => t.count);
    const total = ctx.table.rows.length;
    const share = topShare(counts, 3) * (c.top.reduce((a, b) => a + b.count, 0) / Math.max(1, total));
    if (share < 0.75 || c.distinct < 6) continue;

    const leaders = c.top.slice(0, 3).map((t) => t.value);
    const want = new Set(leaders);
    const refs: number[] = [];
    for (let r = 0; r < total && refs.length < LIMITS.auditRowCap; r++) {
      if (want.has((ctx.table.rows[r][col.index] ?? "").trim())) refs.push(r);
    }

    out.push({
      id: `conc:${col.name}`,
      kind: "concentration",
      headline: `3 of ${c.distinct} ${col.name} values cover ${fmtPct(share)} of the table`,
      columns: [col.name],
      impact: score({ effect: Math.min(1, (share - 0.7) / 0.3), coverage: share, confidence: 0.9 }),
      confidence: 0.9,
      coverage: share,
      evidence: {
        distinct: c.distinct,
        top3SharePct: round(share * 100, 1),
        leaders: leaders.join(", "),
        balance: round(c.balance, 3),
        note: "The long tail here is thin enough that per-level averages outside the top few rest on very few rows.",
      },
      rowRefs: refs,
      breakdown: c.top.slice(0, 8).map((t) => ({ label: t.value, value: t.count })),
    });
  }
  return out;
}

/** Periods with no rows at all — usually a broken pipeline, not a quiet week. */
function detectCalendarGaps(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  for (const dateCol of ctx.dateCols.slice(0, 2)) {
    const series = buildSeries(ctx, dateCol, null);
    if (!series || !dateCol.temporal) continue;
    const { grain } = chooseGrain(dateCol.temporal.spanDays);
    const stepMs = grain === "day" ? 86400000 : grain === "week" ? 7 * 86400000 : 30 * 86400000;

    const times = series.labels.map((l) => Date.parse(grain === "month" ? `${l}-01` : l));
    const gaps: Array<{ from: string; to: string; periods: number }> = [];
    for (let i = 1; i < times.length; i++) {
      const missed = Math.round((times[i] - times[i - 1]) / stepMs) - 1;
      if (missed >= 2) {
        gaps.push({ from: series.labels[i - 1], to: series.labels[i], periods: missed });
      }
    }
    if (gaps.length === 0) continue;
    const worst = gaps.reduce((a, b) => (b.periods > a.periods ? b : a));
    const totalMissing = gaps.reduce((a, g) => a + g.periods, 0);
    const expected = series.labels.length + totalMissing;
    const share = totalMissing / expected;
    if (share < 0.03) continue;

    out.push({
      id: `gap:${dateCol.name}`,
      kind: "gap",
      headline: `${totalMissing} ${grain}${totalMissing === 1 ? "" : "s"} in ${
        dateCol.name
      } have no rows at all`,
      columns: [dateCol.name],
      /*
       * Coverage is 1, not the share of periods missing, and that is
       * deliberate. Every other finding is about rows that are present,
       * so scoring on how much of the table they touch is right. A gap
       * is about rows that are absent: three dead weeks are 4% of the
       * calendar and contaminate 100% of every total and average drawn
       * across the window. Scoring it like the others buried a pipeline
       * outage below a mild correlation.
       */
      impact: score({ effect: Math.min(1, share / 0.15), coverage: 1, confidence: 0.95 }),
      confidence: 0.95,
      coverage: share,
      evidence: {
        missingPeriods: totalMissing,
        longestGapFrom: worst.from,
        longestGapTo: worst.to,
        longestGapPeriods: worst.periods,
        grain,
        note: "A gap reads as zero in a chart and as nothing in an average — the two disagree by exactly these periods.",
      },
      rowRefs: [],
      series: { labels: series.labels, values: series.values },
    });
  }
  return out;
}

/* ───────────────────────── utilities ────────────────────────── */

/**
 * Name a set of segments the way a person would say it out loud.
 *
 * "every channel" is English; "every returned" is not. Boolean columns
 * name a condition rather than a dimension, so they get counted instead.
 */
function segmentPhrase(col: ColumnProfile, against: number, total: number): string {
  if (col.kind === "boolean") {
    return against === total ? `both sides of ${col.name}` : `one side of ${col.name}`;
  }
  return `${against === total ? "every" : "almost every"} ${col.name}`;
}

/**
 * Thin a pair of columns down to a drawable cloud.
 *
 * Evenly strided rather than random: a stride keeps whatever ordering
 * the table already has visible in the sample, and it is deterministic,
 * so the same dataset draws the same picture every time.
 */
const SCATTER_POINTS = 260;

function sampleScatter(xs: number[], ys: number[], xLabel: string, yLabel: string) {
  const n = Math.min(xs.length, ys.length);
  const stride = Math.max(1, Math.ceil(n / SCATTER_POINTS));
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i += stride) {
    x.push(round(xs[i], 4));
    y.push(round(ys[i], 4));
  }
  return { x, y, xLabel, yLabel };
}

function quantileOf(values: Array<number | null>, q: number): number | null {
  const clean = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  return clean[Math.floor((clean.length - 1) * q)];
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function fmtPct(x: number): string {
  const p = x * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
