import type { Pool } from "pg";
import { decompose, explain } from "./decompose";
import { levelPhrase, rankFindings } from "./findings";
import { humanize } from "./plain";
import { changePoint, linearFit, mean, median } from "./stats";
import {
  corrSql,
  levelsFor,
  rateSql,
  seriesSql,
  segmentSql,
  splitSql,
  type Grain,
  type Target,
  type WarehouseColumn,
} from "./warehouse";
import { LIMITS, type Analysis, type Finding, type QualityIssue } from "./types";

/**
 * The detector battery, against a database.
 *
 * Each of these mirrors a file detector and is deliberately given the
 * same id scheme, the same evidence keys and the same headline wording
 * — so a warehouse finding is indistinguishable from a file finding to
 * everything downstream. The plain-language layer, the change
 * detection between runs and the email digest were all written against
 * `Finding` and need no knowledge that the numbers came from SQL.
 *
 * The thresholds are the file engine's, for the same reason: a client
 * who uploads a sample and then connects the real table should not get
 * a different answer about the same data.
 */

interface Ctx {
  client: Pool;
  target: Target;
  columns: WarehouseColumn[];
  rowCount: number;
}

const NUMERIC = new Set(["number", "integer", "currency", "percent"]);

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

function score(parts: { effect: number; coverage: number; confidence: number; recency?: number }): number {
  const { effect, coverage, confidence, recency = 1 } = parts;
  return Math.min(1, Math.max(0, effect)) * Math.sqrt(Math.min(1, Math.max(0, coverage))) * confidence * recency;
}

function grainFor(spanDays: number): Grain {
  if (spanDays <= 90) return "day";
  if (spanDays <= 730) return "week";
  return "month";
}

export async function analyzeWarehouse(
  client: Pool,
  target: Target,
  columns: WarehouseColumn[],
  rowCount: number,
): Promise<Analysis> {
  const started = Date.now();
  /*
   * CPU time, not wall time, is what "local work" means here.
   *
   * The first version of this reported the whole wall clock as local
   * and so claimed 9,671ms of local work on a run that spent almost
   * all of it waiting on the database — the exact opposite of what
   * this path is for, printed on screen as if it were evidence.
   * process.cpuUsage counts only cycles this process actually burned,
   * so time blocked on a socket does not land in the wrong column.
   */
  const cpuStart = process.cpuUsage();
  const ctx: Ctx = { client, target, columns, rowCount };

  const numeric = columns.filter((c) => NUMERIC.has(c.kind));
  const dates = columns.filter((c) => c.kind === "date" && c.temporal?.min);
  const cats = columns.filter((c) => c.kind === "category" || c.kind === "boolean");
  const bools = columns.filter((c) => c.kind === "boolean");

  const findings: Finding[] = [];

  /*
   * Same floor as the file engine, for the same reason, and checked
   * before any detector runs: a table too small to conclude anything
   * from is also too small to be worth six round trips.
   */
  const tooSmall = rowCount < LIMITS.minRowsForFindings;
  const quality = qualityFromProfile(columns, rowCount);
  if (tooSmall) {
    quality.unshift({
      id: "too-few-rows",
      severity: "high" as const,
      title: `Only ${rowCount} row${rowCount === 1 ? "" : "s"} — too few to draw conclusions from`,
      detail: `Patterns need something to stand out from. Below ${LIMITS.minRowsForFindings} rows almost anything looks like a trend, so nothing is reported rather than reporting noise.`,
      rowRefs: [],
      affected: rowCount,
    });
  }

  // Each group is independent, so they run together rather than in
  // sequence — the database is doing the work and these are mostly
  // round trips.
  const batches = tooSmall ? [] : await Promise.all([
    timeFindings(ctx, dates, numeric),
    segmentFindings(ctx, cats, numeric),
    rateFindings(ctx, cats, bools),
    driverFindings(ctx, dates, numeric, cats),
    correlationFindings(ctx, numeric),
    concentrationFindings(ctx, cats),
  ]);
  for (const b of batches) findings.push(...b);

  /*
   * The same ranking the file engine uses, not a second one.
   *
   * Without it the warehouse path emitted the identical paradox once
   * per category column and the identical segment gap three times —
   * the file engine already solves that by capping findings per column
   * set and per kind, and a client who uploads a sample then connects
   * the real table must not get a differently-shaped panel for the
   * same data.
   */
  const ranked = rankFindings(findings);

  const cpu = process.cpuUsage(cpuStart);
  const localMs = Math.round((cpu.user + cpu.system) / 1000);
  const wallMs = Date.now() - started;

  return {
    table: { rows: rowCount, columns: columns.length, malformed: 0 },
    columns,
    quality,
    findings: ranked,
    elapsedMs: wallMs,
    pushdown: {
      localMs,
      // Whatever was not local was spent in the database or on the
      // wire. Stated as a floor, because parallel queries overlap.
      databaseMs: Math.max(0, wallMs - localMs),
      rowsScanned: rowCount,
    },
  };
}

/** Integrity notes computable from the profile alone, with no extra scans. */
function qualityFromProfile(columns: WarehouseColumn[], rowCount: number): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const c of columns) {
    if (c.missing > 0.05) {
      out.push({
        id: `missing:${c.name}`,
        severity: c.missing > 0.4 ? "high" : c.missing > 0.15 ? "medium" : "low",
        column: c.name,
        title: `${(c.missing * 100).toFixed(c.missing < 0.1 ? 1 : 0)}% of ${humanize(c.name)} is empty`,
        detail:
          "Gaps this size move an average without changing the row count, so totals and means disagree.",
        rowRefs: [],
        affected: Math.round(c.missing * rowCount),
      });
    }
    if (c.distinct === 1 && c.missing < 1) {
      out.push({
        id: `constant:${c.name}`,
        severity: "low" as const,
        column: c.name,
        title: `${humanize(c.name)} never changes`,
        detail: "One value in every row. It can't explain variation in anything else.",
        rowRefs: [],
        affected: rowCount,
      });
    }
  }
  return out.sort((a, b) => (b.severity === "high" ? 1 : 0) - (a.severity === "high" ? 1 : 0));
}

/* ───────────────────── time ───────────────────── */

async function timeFindings(
  ctx: Ctx,
  dates: WarehouseColumn[],
  numeric: WarehouseColumn[],
): Promise<Finding[]> {
  const out: Finding[] = [];
  const dateCol = dates[0];
  if (!dateCol?.temporal) return out;
  const grain = grainFor(dateCol.temporal.spanDays);

  const targets: Array<WarehouseColumn | null> = [null, ...numeric.slice(0, 6)];
  for (const metric of targets) {
    let series;
    try {
      series = await seriesSql(ctx.client, ctx.target, dateCol.name, metric?.name ?? null, grain);
    } catch {
      continue;
    }
    if (series.values.length < 6) continue;

    const label = metric ? humanize(metric.name) : "row volume";
    const cp = changePoint(series.values);
    const fit = linearFit(series.values.map((_, i) => i), series.values);

    if (cp && cp.magnitude >= 3) {
      const rel = cp.before === 0 ? 1 : Math.abs(cp.after - cp.before) / Math.abs(cp.before);

      /*
       * Cross-check the median against the mean before believing a step.
       *
       * A median is the right summary for a metric with outliers, which
       * is why the series uses one. But on a mixture — several price
       * populations in one column — the median sits inside whichever
       * population holds the middle row, so a shift in the *proportions*
       * can walk the median from one cluster to the next and show a
       * step where no level changed. The mean moves smoothly through
       * exactly that situation. So when the median claims a step several
       * times larger than the mean's, the mix moved rather than the
       * metric, and the paradox detector is the one with the real story.
       */
      const meanBefore = mean(series.means.slice(0, cp.index));
      const meanAfter = mean(series.means.slice(cp.index));
      const meanRel =
        Number.isFinite(meanBefore) && meanBefore !== 0
          ? Math.abs(meanAfter - meanBefore) / Math.abs(meanBefore)
          : NaN;
      const mixtureArtefact = metric !== null && Number.isFinite(meanRel) && rel > Math.max(0.1, meanRel * 2.5);

      if (
        !mixtureArtefact &&
        rel >= 0.08 &&
        !(metric?.kind === "integer" && Math.abs(cp.after - cp.before) < 2)
      ) {
        const confidence = Math.min(1, cp.magnitude / 8);
        out.push({
          id: `shift:${dateCol.name}:${label}`,
          kind: "shift",
          headline: `${cap(label)} ${cp.after > cp.before ? "rose" : "fell"} ${fmtPct(rel)} at ${
            series.labels[cp.index]
          } and stayed there`,
          columns: metric ? [dateCol.name, metric.name] : [dateCol.name],
          impact: score({
            effect: Math.min(1, rel / 0.5),
            coverage: 1,
            confidence,
            recency: 0.6 + 0.4 * (cp.index / series.values.length),
          }),
          confidence,
          coverage: 1,
          evidence: {
            before: round(cp.before),
            after: round(cp.after),
            relativeChangePct: round(rel * 100, 1),
            breakAt: series.labels[cp.index],
            sigmas: round(cp.magnitude, 2),
            statistic: `per-${grain} median, computed in the database`,
          },
          rowRefs: [],
          sample: { column: null, value: null },
          series: {
            labels: series.labels,
            values: series.values.map((v) => round(v)),
            markerIndex: cp.index,
          },
          breakdown: [
            { label: `Before ${series.labels[cp.index]}`, value: round(cp.before) },
            { label: "After", value: round(cp.after) },
          ],
        });
        continue;
      }
    }

    if (fit.r2 >= 0.35) {
      const first = fit.intercept;
      const last = fit.intercept + fit.slope * (series.values.length - 1);
      if (first === 0) continue;
      const total = (last - first) / Math.abs(first);
      if (Math.abs(total) < 0.12) continue;

      /*
       * The same mixture guard the shift detector uses. Suppressing it
       * there alone just moved the false claim next door: with the step
       * rejected, the trend detector fitted a line through the same
       * median hop and reported unit price up 119% when the mean had
       * moved 15%. A guard on one shape of a claim is not a guard on
       * the claim.
       */
      if (metric) {
        const meanFit = linearFit(series.means.map((_, i) => i), series.means);
        const mFirst = meanFit.intercept;
        const mLast = meanFit.intercept + meanFit.slope * (series.means.length - 1);
        if (mFirst !== 0) {
          const meanTotal = Math.abs((mLast - mFirst) / Math.abs(mFirst));
          if (Math.abs(total) > Math.max(0.15, meanTotal * 2.5)) continue;
        }
      }
      out.push({
        id: `trend:${dateCol.name}:${label}`,
        kind: "trend",
        headline: `${cap(label)} has moved ${total > 0 ? "up" : "down"} ${fmtPct(Math.abs(total))} ${
          fit.r2 >= 0.7 ? "steadily across" : "on balance over"
        } the window`,
        columns: metric ? [dateCol.name, metric.name] : [dateCol.name],
        impact: score({ effect: Math.min(1, Math.abs(total) / 0.75), coverage: 1, confidence: fit.r2 }),
        confidence: fit.r2,
        coverage: 1,
        evidence: {
          start: round(first),
          end: round(last),
          totalChangePct: round(total * 100, 1),
          rSquared: round(fit.r2, 3),
          periods: series.values.length,
          statistic: `per-${grain} median, computed in the database`,
        },
        rowRefs: [],
        sample: { column: null, value: null },
        series: { labels: series.labels, values: series.values.map((v) => round(v)) },
      });
    }
  }
  return out;
}

/* ─────────────────── segments ─────────────────── */

async function segmentFindings(
  ctx: Ctx,
  cats: WarehouseColumn[],
  numeric: WarehouseColumn[],
): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const cat of cats.slice(0, 5)) {
    if (cat.distinct < 2 || cat.distinct > 50) continue;
    for (const metric of numeric.slice(0, 5)) {
      let groups;
      try {
        groups = await segmentSql(ctx.client, ctx.target, cat.name, metric.name);
      } catch {
        continue;
      }
      if (groups.length < 2) continue;

      const overall = metric.numeric?.median ?? median(groups.map((g) => g.median));
      if (!Number.isFinite(overall) || overall === 0) continue;

      let worst: (typeof groups)[number] | null = null;
      for (const g of groups) {
        if (!worst || Math.abs(g.median - overall) > Math.abs(worst.median - overall)) worst = g;
      }
      if (!worst) continue;

      const relative = Math.abs(worst.median - overall) / Math.abs(overall);
      if (relative < 0.15) continue;

      /*
       * Same mixture guard as the shift detector, for the same reason.
       * A segment that leans towards one population of a mixed metric
       * shows a median miles from everyone else's while its mean is
       * nearly identical — "returned = true runs 39% below on price"
       * when the real difference is 5%, because returned rows skew to
       * the cheap channel. The weighted mean is exact and free here,
       * since every group already carries its own mean and count.
       */
      const total = groups.reduce((a, g) => a + g.n, 0);
      const overallMean = groups.reduce((a, g) => a + g.mean * g.n, 0) / Math.max(1, total);
      if (Number.isFinite(overallMean) && overallMean !== 0) {
        const relMean = Math.abs(worst.mean - overallMean) / Math.abs(overallMean);
        if (relative > Math.max(0.1, relMean * 2.5)) continue;
      }

      const coverage = worst.n / Math.max(1, total);
      // Without row-level data there is no KS test, so confidence comes
      // from the size of the gap and the size of the segment behind it.
      const confidence = Math.min(1, relative / 0.5) * Math.min(1, Math.sqrt(worst.n / 200));
      if (confidence < 0.25) continue;

      out.push({
        id: `segment:${cat.name}:${metric.name}`,
        kind: "relationship",
        headline: `${levelPhrase(cat, worst.level)} runs ${fmtPct(relative)} ${
          worst.median > overall ? "above" : "below"
        } everything else on ${humanize(metric.name)}`,
        columns: [cat.name, metric.name],
        impact: score({ effect: Math.min(1, relative / 0.6), coverage, confidence }),
        confidence,
        coverage,
        evidence: {
          segment: worst.level,
          segmentMedian: round(worst.median),
          overallMedian: round(overall),
          rowsInSegment: worst.n,
          note: "Medians computed per segment in the database, over every row.",
        },
        rowRefs: [],
        sample: { column: cat.name, value: worst.level },
        breakdown: groups
          .map((g) => ({ label: g.level, value: round(g.median), weight: g.n }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8),
      });
    }
  }
  return out;
}

async function rateFindings(
  ctx: Ctx,
  cats: WarehouseColumn[],
  bools: WarehouseColumn[],
): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const flag of bools.slice(0, 3)) {
    for (const cat of cats.slice(0, 5)) {
      if (cat.name === flag.name || cat.distinct < 2 || cat.distinct > 50) continue;
      let groups;
      try {
        groups = await rateSql(ctx.client, ctx.target, cat.name, flag.name);
      } catch {
        continue;
      }
      if (groups.length < 2) continue;

      const totalN = groups.reduce((a, g) => a + g.n, 0);
      const totalH = groups.reduce((a, g) => a + g.hits, 0);

      let worst: { level: string; rate: number; rest: number; n: number; z: number } | null = null;
      for (const g of groups) {
        const restN = totalN - g.n;
        const restH = totalH - g.hits;
        if (restN < 30 || g.n < 30) continue;
        const p1 = g.hits / g.n;
        const p0 = restH / restN;
        const pooled = (g.hits + restH) / (g.n + restN);
        const se = Math.sqrt(pooled * (1 - pooled) * (1 / g.n + 1 / restN));
        if (se === 0) continue;
        const z = Math.abs(p1 - p0) / se;
        if (!worst || z > worst.z) worst = { level: g.level, rate: p1, rest: p0, n: g.n, z };
      }
      if (!worst || worst.z < 4) continue;
      const gap = Math.abs(worst.rate - worst.rest);
      if (gap < 0.03) continue;

      const coverage = worst.n / Math.max(1, totalN);
      const confidence = Math.min(1, worst.z / 10);
      const times = worst.rest === 0 ? 0 : worst.rate / worst.rest;

      out.push({
        id: `rate:${flag.name}:${cat.name}`,
        kind: "imbalance",
        headline: `${worst.level} is ${fmtPct(worst.rate)} ${humanize(flag.name)}${
          times >= 1.5 ? ` — ${times.toFixed(1)}× the rest` : ""
        }`,
        columns: [cat.name, flag.name],
        impact: score({ effect: Math.min(1, gap / 0.2), coverage, confidence }),
        confidence,
        coverage,
        evidence: {
          segment: worst.level,
          segmentRatePct: round(worst.rate * 100, 1),
          everyoneElsePct: round(worst.rest * 100, 1),
          pointGapPct: round(gap * 100, 1),
          rowsInSegment: worst.n,
          zScore: round(worst.z, 1),
          note: "Two-proportion z-test over every row, computed in the database.",
        },
        rowRefs: [],
        sample: { column: cat.name, value: worst.level },
        breakdown: groups
          .map((g) => ({ label: g.level, value: round((g.hits / g.n) * 100, 1), weight: g.n }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
      });
    }
  }
  return out;
}

/* ─────────────── paradox and drivers ─────────────── */

async function driverFindings(
  ctx: Ctx,
  dates: WarehouseColumn[],
  numeric: WarehouseColumn[],
  cats: WarehouseColumn[],
): Promise<Finding[]> {
  const out: Finding[] = [];
  const dateCol = dates[0];
  if (!dateCol?.temporal?.min || !dateCol.temporal.max) return out;

  const mid = new Date(
    (Date.parse(dateCol.temporal.min) + Date.parse(dateCol.temporal.max)) / 2,
  ).toISOString();

  for (const metric of numeric.slice(0, 4)) {
    for (const cat of cats.slice(0, 4)) {
      if (cat.distinct < 2 || cat.distinct > 20) continue;
      let split;
      try {
        split = await splitSql(ctx.client, ctx.target, dateCol.name, metric.name, cat.name, mid);
      } catch {
        continue;
      }
      const usable = split.filter((s) => s.nBefore >= 5 && s.nAfter >= 5);
      if (usable.length < 2) continue;

      // Rebuild the decomposition's inputs from the grouped aggregates:
      // one synthetic row per segment per period, weighted by its count.
      const levels = usable.map((s) => s.level);
      const n = usable.length * 2;
      const values = new Float64Array(n);
      const codes = new Int32Array(n);
      const weights: number[] = [];
      usable.forEach((s, i) => {
        values[i * 2] = s.beforeAvg;
        codes[i * 2] = i;
        values[i * 2 + 1] = s.afterAvg;
        codes[i * 2 + 1] = i;
        weights.push(s.nBefore, s.nAfter);
      });

      // Expand by weight so the decomposition sees the real mix.
      const expandedValues: number[] = [];
      const expandedCodes: number[] = [];
      const beforeFlags: boolean[] = [];
      const scale = Math.max(1, Math.ceil(weights.reduce((a, b) => a + b, 0) / 20000));
      usable.forEach((s, i) => {
        const nb = Math.max(1, Math.round(s.nBefore / scale));
        const na = Math.max(1, Math.round(s.nAfter / scale));
        for (let k = 0; k < nb; k++) {
          expandedValues.push(s.beforeAvg);
          expandedCodes.push(i);
          beforeFlags.push(true);
        }
        for (let k = 0; k < na; k++) {
          expandedValues.push(s.afterAvg);
          expandedCodes.push(i);
          beforeFlags.push(false);
        }
      });

      const d = decompose({
        values: Float64Array.from(expandedValues),
        codes: Int32Array.from(expandedCodes),
        levels,
        inBefore: (r) => beforeFlags[r],
        inAfter: (r) => !beforeFlags[r],
        rows: expandedValues.length,
      });
      if (!d || d.before === 0) continue;

      const overallDelta = d.delta / Math.abs(d.before);
      if (Math.abs(overallDelta) < 0.05) continue;

      const against = usable.filter(
        (s) => Math.sign(s.afterAvg - s.beforeAvg) !== Math.sign(d.delta),
      );
      const isParadox = against.length >= usable.length - 1 && usable.length >= 3;
      if (!isParadox && !d.opposed) continue;

      out.push({
        id: `paradox:${metric.name}:${cat.name}`,
        kind: "paradox",
        headline: `${cap(humanize(metric.name))} is ${overallDelta > 0 ? "up" : "down"} ${fmtPct(
          Math.abs(overallDelta),
        )} overall while ${against.length === usable.length ? "every" : "almost every"} ${humanize(
          cat.name,
        )} moved the other way`,
        columns: [dateCol.name, metric.name, cat.name],
        impact: score({ effect: 1, coverage: 1, confidence: 0.85 }),
        confidence: 0.85,
        coverage: 1,
        evidence: {
          overallChangePct: round(overallDelta * 100, 1),
          segmentsAgainst: against.length,
          segmentsTotal: usable.length,
          mixEffectPct: round(d.mixPct, 0),
          rateEffectPct: round(d.ratePct, 0),
          interactionPct: round(d.interactionPct, 0),
          biggestDriver: d.segments[0]?.label ?? "",
          explanation: explain(d, humanize(metric.name), humanize(cat.name)),
          method: "Decomposed from per-segment averages computed in the database.",
        },
        rowRefs: [],
        sample: { column: cat.name, value: d.segments[0]?.label ?? null },
        breakdown: [
          { label: "Overall", value: round(overallDelta * 100, 1) },
          ...usable.map((s) => ({
            label: s.level,
            value: round(
              s.beforeAvg === 0 ? 0 : ((s.afterAvg - s.beforeAvg) / Math.abs(s.beforeAvg)) * 100,
              1,
            ),
            weight: s.nBefore + s.nAfter,
          })),
        ],
      });
    }
  }
  return out;
}

/* ───────────── relationships, concentration ───────────── */

async function correlationFindings(ctx: Ctx, numeric: WarehouseColumn[]): Promise<Finding[]> {
  const out: Finding[] = [];
  const cols = numeric.slice(0, 8);
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      let res;
      try {
        res = await corrSql(ctx.client, ctx.target, cols[i].name, cols[j].name);
      } catch {
        continue;
      }
      if (res.n < 30 || Math.abs(res.r) < 0.45) continue;
      const confidence = Math.min(1, Math.abs(res.r));
      out.push({
        id: `rel:${cols[i].name}:${cols[j].name}`,
        kind: "relationship",
        headline: `${humanize(cols[i].name)} and ${humanize(cols[j].name)} move ${
          res.r > 0 ? "together" : "in opposite directions"
        } (r = ${res.r.toFixed(2)})`,
        columns: [cols[i].name, cols[j].name],
        impact: score({
          effect: Math.min(1, (Math.abs(res.r) - 0.4) / 0.5),
          coverage: 1,
          confidence,
        }),
        confidence,
        coverage: 1,
        evidence: {
          pearson: round(res.r, 3),
          pairs: res.n,
          note: "Association, not cause. Computed over every row in the table.",
        },
        rowRefs: [],
        sample: { column: null, value: null },
      });
    }
  }
  return out;
}

async function concentrationFindings(ctx: Ctx, cats: WarehouseColumn[]): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const cat of cats.slice(0, 6)) {
    if (cat.distinct < 6 || cat.distinct > 10000) continue;
    let levels;
    try {
      levels = await levelsFor(ctx.client, ctx.target, cat.name, 12);
    } catch {
      continue;
    }
    if (levels.length < 4) continue;
    const top3 = levels.slice(0, 3).reduce((a, l) => a + l.count, 0);
    const share = top3 / Math.max(1, ctx.rowCount);
    if (share < 0.75) continue;

    out.push({
      id: `conc:${cat.name}`,
      kind: "concentration",
      headline: `3 of ${cat.distinct} ${humanize(cat.name)} values cover ${fmtPct(share)} of the table`,
      columns: [cat.name],
      impact: score({ effect: Math.min(1, (share - 0.7) / 0.3), coverage: share, confidence: 0.9 }),
      confidence: 0.9,
      coverage: share,
      evidence: {
        distinct: cat.distinct,
        top3SharePct: round(share * 100, 1),
        leaders: levels.slice(0, 3).map((l) => l.value).join(", "),
        note: "Counted over every row, in the database.",
      },
      rowRefs: [],
      sample: { column: cat.name, value: levels[0]?.value ?? null },
      breakdown: levels.slice(0, 8).map((l) => ({ label: l.value, value: l.count })),
    });
  }
  return out;
}
