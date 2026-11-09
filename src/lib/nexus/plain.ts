import type { ColumnProfile, Finding } from "./types";

/**
 * Plain language.
 *
 * The panel was legible to someone who already knows what a
 * Kolmogorov–Smirnov statistic is, which is nobody it is being sold to.
 * A site superintendent looking at "ksStatistic 0.382" learns nothing,
 * and a finding nobody understands is worth less than no finding at
 * all, because it quietly teaches them the tool is not for them.
 *
 * Everything here is deterministic — templated from numbers the engine
 * already computed. Nothing is written by a model, so it costs nothing,
 * never varies between two readings of the same data, and cannot
 * invent. The model's job is the brief; this is the floor underneath
 * it that works whether or not a model is configured.
 *
 * The register to aim for: what a good analyst would say out loud to a
 * client, in one or two sentences. Not a textbook, and not baby talk.
 */

/**
 * The abbreviations that show up in nearly every business export.
 * Expanded only as whole words, so `amount` is never mangled into
 * `amountount` and a column called `id_qty` reads correctly.
 */
const ABBREVIATIONS: Record<string, string> = {
  pct: "percent",
  pc: "percent",
  qty: "quantity",
  amt: "amount",
  avg: "average",
  num: "number",
  no: "number",
  dt: "date",
  ts: "timestamp",
  yr: "year",
  mo: "month",
  wk: "week",
  hrs: "hours",
  hr: "hour",
  mins: "minutes",
  cust: "customer",
  acct: "account",
  dept: "department",
  qtr: "quarter",
  ytd: "year to date",
  mtd: "month to date",
  rev: "revenue",
  cogs: "cost of goods sold",
  po: "purchase order",
  inv: "invoice",
  id: "ID",
};

/** `unit_price` → `unit price`. Headlines should not read like code. */
export function humanize(column: string): string {
  return column
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => ABBREVIATIONS[w.toLowerCase()] ?? w)
    .join(" ");
}

/** What a column holds, said the way a person would say it. */
export const KIND_PLAIN: Record<ColumnProfile["kind"], string> = {
  number: "numbers",
  integer: "whole numbers",
  currency: "money",
  percent: "percentages",
  date: "dates",
  boolean: "yes / no",
  category: "categories",
  identifier: "ID codes",
  text: "free text",
  empty: "empty",
};

/** Jargon-free names for the detector kinds. */
export const KIND_LABEL: Record<Finding["kind"], string> = {
  shift: "Something changed",
  trend: "Moving steadily",
  outlier: "A few extreme values",
  relationship: "Two things linked",
  concentration: "Heavily concentrated",
  paradox: "The headline is misleading",
  gap: "Missing data",
  imbalance: "One group stands out",
};

function pct(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  return `${a < 10 ? a.toFixed(1) : Math.round(a)}%`;
}

function num(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? "—");
  return Math.abs(v) >= 1000
    ? Math.round(v).toLocaleString()
    : String(Math.round(v * 100) / 100);
}

/**
 * One or two sentences saying what a finding means and why it matters.
 *
 * Templated per detector rather than per finding, so the wording is
 * consistent and a reader learns the shape of it once.
 */
export function plainMeaning(f: Finding): string {
  const e = f.evidence;
  const col = (i: number) => humanize(f.columns[i] ?? "");

  if (f.kind === "paradox") {
    return (
      `Taken as a whole, ${col(1)} looks like it moved ${Number(e.overallChangePct) > 0 ? "up" : "down"} ${pct(
        e.overallChangePct,
      )}. It didn't. Every ${col(2)} actually went the other way — the total only moved because the ` +
      `mix of ${col(2)} changed. Acting on the headline number here would point you in the wrong direction.`
    );
  }

  if (f.kind === "shift") {
    return (
      `Up to ${e.breakAt}, this sat around ${num(e.before)}. After that date it sat around ${num(e.after)}, ` +
      `and it has stayed there since. That is a step, not drift — something specific changed around then, ` +
      `and it is worth finding out what.`
    );
  }

  if (f.kind === "trend") {
    const up = Number(e.totalChangePct) > 0;
    return (
      `This has been drifting ${up ? "up" : "down"} across the whole period rather than jumping at one point — ` +
      `from about ${num(e.start)} to about ${num(e.end)}. Slow changes like this are easy to miss month to month.`
    );
  }

  if (f.id.startsWith("rate:")) {
    const seg = String(e.segment);
    const a = Number(e.segmentRatePct);
    const b = Number(e.everyoneElsePct);
    const times = b > 0 ? a / b : 0;
    return (
      `${seg} comes out at ${pct(a)} versus ${pct(b)} everywhere else` +
      (times >= 1.5 ? `, roughly ${times.toFixed(1)} times the rate` : "") +
      `. That gap is across ${num(e.rowsInSegment)} rows, so it is unlikely to be chance.`
    );
  }

  if (f.id.startsWith("ratio:")) {
    return (
      `${e.segment} sits at ${num(e.segmentRatio)} on ${col(1)} divided by ${col(2)}, against ${num(
        e.overallRatio,
      )} for everything else — ${pct(e.differencePct)} apart. Neither column shows this on its own; ` +
      `it only appears when you compare the two.`
    );
  }

  if (f.id.startsWith("segment:")) {
    return (
      `${e.segment} typically runs at ${num(e.segmentMedian)} where everything else runs at ${num(
        e.overallMedian,
      )}. Based on ${num(e.rowsInSegment)} rows, so this is a real difference rather than a few odd entries.`
    );
  }

  if (f.id.startsWith("mix:")) {
    return (
      `${e.level} used to be ${pct(e.shareBeforePct)} of your rows and is now ${pct(e.shareAfterPct)}. ` +
      `Nothing about ${e.level} itself changed — there is just more or less of it, which quietly shifts ` +
      `every average that includes it.`
    );
  }

  if (f.kind === "relationship") {
    const r = Math.abs(Number(e.pearson ?? e.spearman ?? 0));
    const strength = r > 0.8 ? "very closely" : r > 0.6 ? "closely" : "fairly closely";
    return (
      `When one of these goes up, the other tends to ${Number(e.pearson) < 0 ? "go down" : "go up"} too, ` +
      `${strength}. That does not mean one causes the other — they may both follow something that isn't in ` +
      `this file at all.`
    );
  }

  if (f.kind === "outlier") {
    return (
      `Most values sit near ${num(e.median)}, but ${num(e.count)} of them are far outside that, the largest being ` +
      `${num(e.mostExtreme)}. Together they account for ${pct(e.shareOfTotalPct)} of the column's total, which is ` +
      `enough to drag any average you calculate. Check whether they are real or data-entry mistakes.`
    );
  }

  if (f.kind === "concentration") {
    return (
      `Three values — ${e.leaders} — cover ${pct(e.top3SharePct)} of everything. The other ${
        Number(e.distinct) - 3
      } barely appear, so any average you work out for those rests on very few rows and should not be trusted far.`
    );
  }

  if (f.kind === "gap") {
    return (
      `There are ${num(e.missingPeriods)} ${e.grain}s with no rows at all, the longest running from ${
        e.longestGapFrom
      } to ${e.longestGapTo}. A chart draws those as zero and an average ignores them entirely, so the two ` +
      `disagree by exactly that much. Usually a system outage rather than a quiet week.`
    );
  }

  return "";
}

/** How to read the picture on this card. */
export function chartCaption(f: Finding): string | null {
  if (f.series && f.series.markerIndex !== undefined) {
    return `Each point is one period. The upright line marks ${f.series.labels[f.series.markerIndex]}, where the level changed; the dashed lines are the average before and after.`;
  }
  if (f.series) return "Each point is one period, earliest on the left.";
  if (f.scatter) {
    return `Each dot is one row: ${humanize(f.scatter.xLabel)} across, ${humanize(f.scatter.yLabel)} up. A tilted cloud means they move together.`;
  }
  if (f.kind === "paradox") {
    return "The top bar is the overall change. Every bar below it is one group. They point opposite ways, which is the whole point.";
  }
  if (f.breakdown && f.breakdown.some((b) => b.value < 0)) {
    return "Bars right of the centre line went up, bars left went down.";
  }
  if (f.breakdown) return "Longer bars are larger values.";
  return null;
}

/**
 * Plain readings for the figures in the evidence table.
 *
 * Shown beside the raw number rather than instead of it: an analyst
 * checking the work wants the statistic, and everyone else wants the
 * sentence. Removing the number to help the second reader would lose
 * the first, who is the one deciding whether to trust any of it.
 */
export const EVIDENCE_PLAIN: Record<string, string> = {
  pValue: "How likely this is coincidence. Under 0.05 is usually taken as real; under 0.0001 is near-certain.",
  ksStatistic: "How far apart two groups' spreads are, 0 to 1. Above 0.25 is a clear separation.",
  zScore: "How many standard errors apart. Above 4 is very unlikely to be chance.",
  sigmas: "Size of the step against the usual wobble. Above 3 means it stands clear of the noise.",
  rSquared: "How tightly the points follow a straight line, 0 to 1. Above 0.7 is a clean trend.",
  mad: "Typical distance from the middle value. Like a standard deviation, but a few extreme values can't inflate it.",
  median: "The middle value. Half the rows are above it, half below.",
  mean: "The plain average. Pulled around by extreme values, which is why the median sits beside it.",
  pearson: "Straight-line link between two columns, −1 to 1. Zero means no link.",
  spearman: "Rank-based link. Catches relationships that curve, which the straight-line one misses.",
  statistic: "How rows were grouped and summarised before the test ran.",
  mixEffectPct: "How much of the change came from the balance between groups shifting.",
  rateEffectPct: "How much came from the groups' own values changing.",
  interactionPct: "The small remainder where both moved at once.",
  robustGap: "Distance from the overall middle, measured in typical-wobble units.",
  coverage: "Share of all rows this finding is about.",
  balance: "How evenly spread the categories are, 0 to 1. Near 0 means one dominates.",
};

/** The standing caution. Calm, specific, and never hidden. */
export const DUE_DILIGENCE = {
  heading: "Check it before you act on it",
  body:
    "Everything here is computed from the file you gave it, and the file can be wrong — a mis-keyed figure, a missing month, a column that means something different from what its name suggests. Open the rows behind any finding before you act on it, and sense-check it against what you already know about your business. This is a second pair of eyes, not a replacement for yours.",
} as const;
