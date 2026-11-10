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
 * A chart explained to someone who has not read a chart like it before.
 *
 * The one-line captions assumed the reader already knew what a scatter
 * plot was for. Someone who has to stand up and present this needs
 * three things in this order: what the marks on the page represent,
 * the single thing to look at, and the mistake that would embarrass
 * them. Anything more is a statistics lesson nobody asked for.
 */
export interface ReadingGuide {
  /** What the marks on the page are. */
  looking: string;
  /** The one thing to look at. */
  read: string;
  /** The trap. */
  mislead: string;
}

/**
 * The bucket size a finding was computed at.
 *
 * Most detectors record it as `grain`, but the time-series ones only
 * leave it inside `statistic` ("per-week median"), which left the
 * guidance saying "one point per period" when it could say "per week".
 */
function grainOf(e: Finding["evidence"]): string {
  if (typeof e.grain === "string") return e.grain;
  const m = typeof e.statistic === "string" ? /per-(\w+)/.exec(e.statistic) : null;
  return m ? m[1] : "period";
}

/** Sentence-case, for text built from a column name that starts it. */
function lead(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function howToRead(f: Finding): ReadingGuide | null {
  const grain = grainOf(f.evidence);
  // Time findings list the date column first; the plotted value is the second.
  const plotted = humanize(f.columns.length > 1 ? f.columns[1] : f.columns[0] ?? "the value");

  if (f.series && f.series.markerIndex !== undefined) {
    const at = f.series.labels[f.series.markerIndex];
    return {
      looking: `A line of ${plotted}, one point per ${grain}, oldest on the left. The upright line sits at ${at}.`,
      read: `Look at the two dashed lines — the average before ${at} and the average after. The gap between them is the whole finding. Everything else is detail.`,
      mislead: `One freak ${grain} can drag an average. Check the points after the line stay at the new level instead of one spike pulling it there.`,
    };
  }

  if (f.series) {
    const warn = f.kind === "gap";
    return {
      looking: `A line of ${warn ? "how many rows arrive" : plotted}, one point per ${grain}, oldest on the left.`,
      read: warn
        ? `Look for the flat stretches at zero. Those are ${grain}s with no rows at all — not ${grain}s where nothing happened.`
        : `Ignore the wobble between neighbouring points and follow the overall direction across the whole width.`,
      mislead: warn
        ? `A gap in the data is not the same as a gap in the business. It usually means a feed broke, not that work stopped.`
        : `A short window makes almost anything look like a straight line. The fewer points there are, the less a trend means.`,
    };
  }

  if (f.scatter) {
    return {
      looking: `One dot per row. ${lead(humanize(f.scatter.xLabel))} along the bottom, ${humanize(f.scatter.yLabel)} up the side.`,
      read: `Look at the tilt of the cloud. Sloping up to the right means they rise together; sloping down means one rises as the other falls. A round, shapeless blob means no link.`,
      mislead: `A tilt never proves cause. Both columns may be following something that is not in this data — a season, a policy change, one big customer.`,
    };
  }

  if (f.kind === "paradox" && f.breakdown) {
    return {
      looking: `The top bar is the overall move. Every bar below it is one group on its own.`,
      read: `Check which way the top bar points, then which way the ones below it point. Here they disagree, and that disagreement is the finding.`,
      mislead: `The overall number is not wrong, it is just not about what it looks like. Quoting it on its own would have you report the opposite of what happened.`,
    };
  }

  if (f.breakdown && f.breakdown.some((b) => b.value < 0)) {
    return {
      looking: `One bar per group, measured from the centre line.`,
      read: `Bars to the right went up, bars to the left went down. Length is how far it moved.`,
      mislead: `A long bar on a small group can be a handful of rows moving. Check the row counts before you name it in a meeting.`,
    };
  }

  if (f.breakdown) {
    return {
      looking: `One bar per value of ${humanize(f.columns[0] ?? "the column")}. Longer means more.`,
      read: `Look at how quickly the bars get shorter. A few long ones and then a cliff means a handful of values account for nearly everything.`,
      mislead: `The short bars rest on very few rows. Any average or rate you quote for them can swing wildly on one or two records.`,
    };
  }

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

/**
 * What to say, what to do, and how far to trust it.
 *
 * The finding tells you what the data says. None of that helps the
 * person who has to stand up on Monday and explain it to someone more
 * senior than them, which is the actual job. So: a sentence written to
 * be said out loud, the next moves, and an honest line on what the
 * number can and cannot carry.
 *
 * The certainty line is deliberately not a disclaimer. A disclaimer is
 * the same words on every card and gets skipped by the second one. This
 * says what would specifically make *this* finding wrong, which is the
 * thing a sharp manager is about to ask anyway.
 */
export interface Briefing {
  /** A sentence written to be read aloud, with the real numbers in it. */
  say: string;
  /** Concrete next moves, most useful first. */
  doNext: string[];
  /** What this number can and cannot carry. */
  certainty: string;
}

export function briefing(f: Finding): Briefing {
  const b = briefingFor(f);
  // Several of these open with a column name, which arrives lower-case.
  return { ...b, say: lead(b.say) };
}

function briefingFor(f: Finding): Briefing {
  const e = f.evidence;
  const col = (i: number) => humanize(f.columns[i] ?? "");
  const grain = grainOf(e);
  /*
   * A time-based finding lists its date column first, so the thing the
   * numbers are about is the second one. Reading col(0) put "order date
   * stepped from 2.74 to 5.16" on screen — the right figures under the
   * wrong column's name, which is worse than no sentence at all.
   */
  const metric = humanize(f.columns.length > 1 ? f.columns[1] : f.columns[0] ?? "this");
  const rows = Number(e.pairs ?? e.rows ?? e.n ?? 0);
  const basis = Number.isFinite(rows) && rows > 0 ? ` It rests on ${num(rows)} rows.` : "";

  switch (f.kind) {
    case "paradox":
      return {
        say:
          `Our ${col(1)} looks like it went ${Number(e.overallChangePct) > 0 ? "up" : "down"} ${pct(e.overallChangePct)}, ` +
          `but that is not a real move — every ${col(2)} went the other way. The total shifted because the mix of ${col(2)} changed. ` +
          `I would report the groups separately rather than the headline.`,
        doNext: [
          `Report ${col(2)} individually until the mix settles — the combined number is actively misleading right now.`,
          `Find out why the mix of ${col(2)} moved. That shift is the real story, not the metric.`,
          `Check whether any target, forecast or bonus is keyed to the overall figure, because it is currently pointing the wrong way.`,
        ],
        certainty:
          `The split between mix and rate is exact arithmetic on these rows, not an estimate. What it cannot tell you is why the mix moved — ` +
          `that needs someone who knows the business.`,
      };

    case "shift":
      return {
        say:
          `${metric} stepped from about ${num(e.before)} to about ${num(e.after)} around ${e.breakAt}, and it has stayed there since. ` +
          `That is a level change rather than gradual drift, so something specific happened around that date.`,
        doNext: [
          `Work out what changed near ${e.breakAt} — a process, a supplier, a system release, a pricing or policy change.`,
          `If it was deliberate, this is your before-and-after evidence. If nobody owns it, that is the thing to escalate.`,
          `Check whether any average spanning that date is being quoted anywhere, because it describes neither period.`,
        ],
        certainty:
          `The step is in the data and the date is where the fit is best.${basis} It does not predict that the new level holds — ` +
          `it says where the level has been since, and that is all.`,
      };

    case "trend":
      return {
        say:
          `${metric} has moved ${Number(e.totalChangePct) > 0 ? "up" : "down"} about ${pct(e.totalChangePct)} across the window, ` +
          `and fairly consistently rather than jumping around.`,
        doNext: [
          `Check the most recent ${grain}s on their own. A long trend can already have turned at the near end.`,
          `Find out whether this is intended. A drift nobody chose is a different conversation from one that is on plan.`,
          `Agree the level at which it stops being fine, and watch for that rather than re-reading the chart each month.`,
        ],
        certainty:
          `A straight line fitted through past points describes where things have been. It is not a forecast, and extending it off the ` +
          `right-hand edge is the most common way to be wrong in public. Trends bend.`,
      };

    case "outlier":
      return {
        say:
          `About ${num(e.count)} rows sit far outside the normal range for ${col(0)}. They are extreme enough to pull any average ` +
          `that includes them, so the headline figure for this column is worth a second look.`,
        doNext: [
          `Open those rows first and check they are real rather than keying errors or a unit mix-up.`,
          `If they are real, say whether you are reporting with or without them — and be consistent about it.`,
          `If they are errors, any average already circulated using this column needs correcting.`,
        ],
        certainty:
          `"Unusual" here is measured against the spread of this column, nothing more. Extreme does not mean wrong — your biggest ` +
          `customer is an outlier too, and excluding them would be the mistake.`,
      };

    case "relationship":
      return {
        say:
          `${col(0)} and ${col(1)} move ${Number(e.pearson) < 0 ? "in opposite directions" : "together"}, fairly closely. ` +
          `I want to be careful with it though — it is a pattern, not a proven cause.`,
        doNext: [
          `Do not present this as one causing the other. That is the claim a sharp manager will test first.`,
          `Look for the thing that could drive both — a season, a customer, a policy, a date.`,
          `If you believe it is causal, change one deliberately and watch the other. That is the only version worth acting on.`,
        ],
        certainty:
          `A correlation says the two move together in these rows. It says nothing about direction of cause, and nothing about ` +
          `whether it holds outside this data.`,
      };

    case "concentration":
      return {
        say:
          `Three of our ${num(e.distinct)} ${col(0)} values — ${e.leaders} — cover ${pct(e.top3SharePct)} of everything. ` +
          `The rest barely register, so I would not quote separate numbers for them.`,
        doNext: [
          `Report the big few by name and roll the rest into one "other" line rather than listing all of them.`,
          `Avoid quoting averages or rates for the small values — they rest on too few rows to be stable.`,
          `Decide whether the concentration itself is a risk worth raising. Depending on what this column is, it may be the finding.`,
        ],
        certainty:
          `These are exact counts, not estimates. The caution is the other way around: the thin values are where any further ` +
          `number you work out will be unreliable.`,
      };

    case "gap":
      return {
        say:
          `We have no rows at all for ${num(e.missingPeriods)} ${grain}s, the longest stretch running from ${e.longestGapFrom} to ${e.longestGapTo}. ` +
          `Any total covering that span is understated.`,
        doNext: [
          `Establish first whether the business paused or the data collection did. They look identical here and mean opposite things.`,
          `Flag any report already issued that spans those dates, because its totals are too low.`,
          `Fix the collection before reading anything else from this series.`,
        ],
        certainty:
          `This is the one finding where the data cannot speak for itself. Missing rows look the same whether nothing happened ` +
          `or nothing was recorded, and only someone who was there can say which.`,
      };

    case "imbalance": {
      /*
       * Two different findings wear this label: a group whose *share*
       * of the rows moved, and a group that sits apart from the others
       * on some measure. They need opposite advice — one is about the
       * mix changing under you, the other about a group being
       * different — so a single paragraph fitted neither.
       */
      const isShareShift = e.shareBeforePct !== undefined;
      if (isShareShift) {
        const down = Number(e.shareAfterPct) < Number(e.shareBeforePct);
        return {
          say:
          `${e.level} went from ${pct(e.shareBeforePct)} of our rows to ${pct(e.shareAfterPct)} — it is ${down ? "shrinking" : "growing"} ` +
            `as a share of the whole. Nothing about ${e.level} itself has to have changed for this to happen; the mix moved.`,
        doNext: [
            `Check whether ${e.level} actually ${down ? "fell" : "rose"} in absolute terms, or whether everything else just ${down ? "grew" : "shrank"} around it. Those are different problems.`,
            `Re-examine any blended average across this window — a mix shift this size drags totals without any underlying value moving.`,
            `Find out whether the shift was a decision someone made. If it was, this is it working; if not, it is the thing to raise.`,
          ],
          certainty:
            `These are exact row counts, not estimates.${basis} What they cannot tell you is whether the shift is deliberate, ` +
            `seasonal, or the start of something.`,
        };
      }
      return {
        say:
          `${f.headline}. It is a wide enough gap that I do not think it is noise, but I would want to know what is different ` +
          `about that group before drawing a conclusion.`,
        doNext: [
          `Check the group is actually comparable — different customers, different mix, or a different definition would explain it without anything being wrong.`,
          `Ask whoever owns that group. They usually know, and it is a short conversation.`,
          `Decide whether this is a problem to fix or just a difference to expect, and write down which.`,
        ],
        certainty:
          `The gap is real in these rows and unlikely to be chance.${basis} Whether it is a problem is a judgement about the ` +
          `business, which the data cannot make for you.`,
      };
    }
  }
}

/** The standing caution. Calm, specific, and never hidden. */
export const DUE_DILIGENCE = {
  heading: "Check it before you act on it",
  body:
    "Everything here is computed from the file you gave it, and the file can be wrong — a mis-keyed figure, a missing month, a column that means something different from what its name suggests. Open the rows behind any finding before you act on it, and sense-check it against what you already know about your business. This is a second pair of eyes, not a replacement for yours. And none of it is a forecast: every number here describes rows that already exist, so it says where things have been, never where they are going. A pattern that held all year can stop the week after you present it.",
} as const;

/**
 * The same warning, for a connected table.
 *
 * Telling someone their data "came from the file you gave it" when they
 * pointed this at a production database is the kind of small wrongness
 * that makes a reader stop trusting the rest of the page — and the rest
 * of the page is asking them to trust it enough to act.
 */
export const DUE_DILIGENCE_TABLE = {
  heading: DUE_DILIGENCE.heading,
  body:
    "Everything here was computed by your own database over every row in the table, and a table can be wrong — a mis-keyed figure, a missing month, a column that means something different from what its name suggests. Open the rows behind any finding before you act on it, and sense-check it against what you already know about your business. This is a second pair of eyes, not a replacement for yours. And none of it is a forecast: every number here describes rows that already exist, so it says where things have been, never where they are going. A pattern that held all year can stop the week after you present it.",
} as const;
