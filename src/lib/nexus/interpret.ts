import { humanize } from "./plain";
import type { Filter, Plan, Stat } from "./query";
import type { ColumnProfile } from "./types";

/**
 * Read a typed question without a model.
 *
 * The planner was a model call: schema and question out to an API,
 * JSON plan back. It worked, and it cost money per question and sent
 * the column names of whatever a client uploaded to a third party.
 * Both are real problems — the second one more than the first, because
 * "does our data leave the building" is the question that decides
 * deals in regulated industries, and "nothing leaves" is a much better
 * answer than "only the schema".
 *
 * So this reads the question directly. The query language is six
 * shapes, and the questions people actually ask a dataset fall into a
 * handful of grammars: a measure, optionally grouped, optionally
 * filtered, optionally over time. That is a parsing problem, and
 * parsing has the properties this product wants anyway — free,
 * instant, offline, and identical every time it runs.
 *
 * It will not understand everything. When it cannot read a question it
 * says so and shows what it can answer, which is more useful than a
 * confident wrong plan. A model remains optional on top for the
 * questions this misses.
 */

export interface Reading {
  plan: Plan;
  /** How the question was understood, shown back so it can be corrected. */
  reading: string;
  /** Low when several columns matched equally and one was picked. */
  sure: boolean;
}

export interface Unreadable {
  error: string;
  examples: string[];
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "is", "are", "was", "were", "do", "does", "did",
  "show", "me", "what", "whats", "which", "who", "how", "give", "tell",
  "please", "can", "you", "i", "we", "our", "my", "and", "or", "to", "for",
  "in", "on", "at", "by", "with", "from", "that", "this", "it", "its",
  "there", "here", "all", "any", "each", "most", "much", "many", "have",
  "has", "had", "be", "been", "get", "see", "look", "find", "list",
]);

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, twenty: 20, fifty: 50, hundred: 100,
};

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9%$.\s/-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score how well a run of words names a column.
 *
 * Exact and substring matches win outright. Otherwise it is token
 * overlap, so "price" finds `unit_price` and "pay days" finds
 * `days_to_pay` without either needing to be spelled exactly.
 */
/** Crude singular/plural fold, enough for column names. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("ches"))) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * Score how well a run of words names a column.
 *
 * Substring matching is the obvious implementation and is badly
 * wrong: "discount percent".includes("is") is true, because "discount"
 * contains it, and that scored the word "is" as a near-perfect column
 * match — which is how "what is the capital of france" came back as a
 * confident profile of a random column. Matching is on whole words,
 * at word boundaries, with stopwords and very short fragments refused
 * outright. Singular and plural are folded together so "categories"
 * finds `category`.
 */
function scoreColumn(col: ColumnProfile, words: string[]): number {
  const meaningful = words.filter((w) => !STOPWORDS.has(w) && w.length > 1);
  if (meaningful.length === 0) return 0;

  const name = col.name.toLowerCase();
  const human = humanize(col.name).toLowerCase();
  const phrase = words.join(" ");
  const tight = phrase.replace(/\s/g, "");

  if (name === phrase || human === phrase) return 100;
  if (name.replace(/[_-]/g, "") === tight) return 95;

  // Whole-phrase containment, but only at word boundaries and only for
  // phrases long enough to be meant.
  if (phrase.length >= 4) {
    const bounded = new RegExp(`\\b${escapeRe(phrase)}\\b`);
    if (bounded.test(human) || bounded.test(name.replace(/[_-]/g, " "))) {
      return 70 + phrase.length;
    }
  }

  const colWords = new Set(
    human.split(" ").filter((w) => !STOPWORDS.has(w) && w.length > 1).map(stem),
  );
  if (colWords.size === 0) return 0;

  let hits = 0;
  for (const raw of meaningful) {
    const w = stem(raw);
    if (colWords.has(w)) hits += 2;
    else if (w.length >= 4 && [...colWords].some((c) => c.startsWith(w) || w.startsWith(c))) hits += 1;
  }
  if (hits === 0) return 0;
  // Favour columns the question covers fully over long ones it grazes.
  return (hits / colWords.size) * 40 + hits * 5;
}

interface Match {
  col: ColumnProfile;
  score: number;
  at: number;
  len: number;
}

/** Every column the question plausibly names, best first. */
function findColumns(words: string[], columns: ColumnProfile[]): Match[] {
  const out: Match[] = [];
  for (const col of columns) {
    let best: Match | null = null;
    // Windows of up to four words, so multi-word names are found.
    for (let i = 0; i < words.length; i++) {
      for (let len = 1; len <= 4 && i + len <= words.length; len++) {
        const score = scoreColumn(col, words.slice(i, i + len));
        if (score > 0 && (!best || score > best.score)) {
          best = { col, score, at: i, len };
        }
      }
    }
    if (best && best.score >= 20) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NUMERIC = new Set(["number", "integer", "currency", "percent"]);

function pickStat(words: string[], col: ColumnProfile | null): Stat {
  const q = words.join(" ");
  if (/\b(total|sum|altogether|combined)\b/.test(q)) return "sum";
  if (/\b(count|how many|number of|volume)\b/.test(q)) return "count";
  if (/\b(max|maximum|highest|largest|biggest|most expensive|peak)\b/.test(q)) return "max";
  if (/\b(min|minimum|lowest|smallest|cheapest)\b/.test(q)) return "min";
  if (/\b(mean|average|avg)\b/.test(q)) return "mean";
  if (/\b(median|typical|usual)\b/.test(q)) return "median";
  // Money and durations default to the median; a few outliers should not
  // set the answer to "what does this usually cost".
  if (col && (col.kind === "currency" || /time|days|hours|duration|age/i.test(col.name))) return "median";
  return "median";
}

/**
 * Relative and absolute dates, resolved against the DATA's last date
 * rather than today.
 *
 * "last 3 months" on a file whose rows stop in December means the last
 * three months of the file. Anchoring to the wall clock returned an
 * empty window and a confident zero, which looks like an answer.
 */
function parseWhen(q: string, anchorIso?: string): { from?: string; to?: string } | null {
  const anchored = anchorIso ? new Date(`${anchorIso}T00:00:00Z`) : new Date();
  const now = Number.isFinite(anchored.getTime()) ? anchored : new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const back = (days: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - days);
    return iso(d);
  };

  const rel = /\b(?:last|past|previous|trailing)\s+(\d+|[a-z]+)\s*(day|week|month|quarter|year)s?\b/.exec(q);
  if (rel) {
    const n = Number(rel[1]) || NUMBER_WORDS[rel[1]] || 1;
    const unit = rel[2];
    const days =
      unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : unit === "quarter" ? n * 91 : n * 365;
    return { from: back(days) };
  }

  const since = /\bsince\s+(\d{4}-\d{2}(?:-\d{2})?)\b/.exec(q);
  if (since) return { from: since[1].length === 7 ? `${since[1]}-01` : since[1] };

  const year = /\b(?:in|during|for)\s+(20\d{2})\b/.exec(q);
  if (year) return { from: `${year[1]}-01-01`, to: `${year[1]}-12-31` };

  if (/\b(this|last)\s+year\b/.test(q)) {
    const y = now.getUTCFullYear() - (/last/.test(q) ? 1 : 0);
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return null;
}

export function interpret(
  question: string,
  columns: ColumnProfile[],
): Reading | Unreadable {
  const words = tokens(question);
  const q = words.join(" ");
  if (words.length === 0) return unreadable(columns);

  const matches = findColumns(words, columns);

  /*
   * Refuse early when the question does not actually name anything in
   * this file. Without this, "what is the capital of france" matched
   * "what is" to the describe grammar, picked whichever column scored
   * least badly, and answered with total confidence. A confident wrong
   * answer is the one failure this product cannot afford: the whole
   * argument is that you can trust it because you can check it, and
   * nobody checks an answer that looks right.
   */
  const strongest = matches[0]?.score ?? 0;
  const namesSomething =
    strongest >= 40 ||
    (strongest >= 20 && matches.length === 1 && words.length <= 6);
  if (!namesSomething) return unreadable(columns);
  const dateCol = columns.find((c) => c.kind === "date");
  const numericMatches = matches.filter((m) => NUMERIC.has(m.col.kind));
  const catMatches = matches.filter((m) => m.col.kind === "category" || m.col.kind === "boolean");
  const boolMatches = matches.filter((m) => m.col.kind === "boolean");

  // "by X" / "per X" / "for each X" names the grouping explicitly.
  let explicitGroup: ColumnProfile | null = null;
  let explicitMetric: ColumnProfile | null = null;
  const byAt = words.findIndex((w) => w === "by" || w === "per" || w === "across");
  if (byAt >= 0) {
    const after = matches.filter((m) => m.at > byAt).sort((a, b) => b.score - a.score);
    const before = matches.filter((m) => m.at < byAt).sort((a, b) => b.score - a.score);
    /*
     * "A by B" usually groups by B — but "top 5 categories by revenue"
     * is the reverse: the ranking measure follows `by` and the thing
     * being ranked precedes it. Told apart by type, since a measure
     * after `by` with a category before it can only be the ranking.
     */
    const afterIsMeasure = after[0] && NUMERIC.has(after[0].col.kind);
    const beforeIsCategory = before[0] && (before[0].col.kind === "category" || before[0].col.kind === "boolean");
    if (afterIsMeasure && beforeIsCategory) {
      explicitGroup = before[0].col;
      explicitMetric = after[0].col;
    } else if (after.length > 0) {
      explicitGroup = after[0].col;
    }
  }

  const when = parseWhen(q, dateCol?.temporal?.max);
  const filters: Filter[] = [];
  if (when && dateCol) {
    if (when.from) filters.push({ column: dateCol.name, op: "gte", value: when.from });
    if (when.to) filters.push({ column: dateCol.name, op: "lte", value: when.to });
  }

  /*
   * A named level filters: "revenue in the west". Scanned across every
   * category column, not only the ones named by column name — nobody
   * writes "revenue where region is west", they write "in the west",
   * and the column name never appears.
   */
  for (const col of columns) {
    if (col === explicitGroup) continue;
    if (col.kind !== "category" && col.kind !== "boolean") continue;
    const level = col.categorical?.top.find(
      (t) => t.value.length >= 3 && new RegExp(`\\b${escapeRe(t.value.toLowerCase())}\\b`).test(q),
    );
    if (level) filters.push({ column: col.name, op: "eq", value: level.value });
  }
  const filterNote = filters.length
    ? ` (filtered to ${filters.map((f) => `${humanize(String(f.column))} ${f.op === "eq" ? "=" : f.op} ${f.value}`).join(", ")})`
    : "";

  /* ── why did it change ─────────────────────────────────────── */
  if (/\b(why|driving|drove|caused?|cause of|explain|reason|behind)\b/.test(q)) {
    const metric = numericMatches[0]?.col;
    const group = explicitGroup ?? catMatches[0]?.col;
    if (metric && group) {
      return {
        plan: { op: "drivers", metric: metric.name, groupBy: group.name, filter: filters },
        reading: `What moved ${humanize(metric.name)}, broken down by ${humanize(group.name)}${filterNote}`,
        sure: Boolean(explicitGroup) || catMatches.length === 1,
      };
    }
    if (metric) {
      const fallback = columns.find((c) => c.kind === "category" && (c.categorical?.distinct ?? 99) <= 12);
      if (fallback) {
        return {
          plan: { op: "drivers", metric: metric.name, groupBy: fallback.name, filter: filters },
          reading: `What moved ${humanize(metric.name)}, broken down by ${humanize(fallback.name)}${filterNote}`,
          sure: false,
        };
      }
    }
  }

  /* ── rate of a yes/no column ───────────────────────────────── */
  const ratePhrase = /\b(rate|share|percentage|percent|proportion|%|likelihood|how often)\b/.test(q);
  if (boolMatches.length > 0 && (ratePhrase || boolMatches[0].score >= 70)) {
    const flag = boolMatches[0].col;
    const group = explicitGroup ?? catMatches.find((m) => m.col !== flag)?.col;
    return {
      plan: { op: "rate", flag: flag.name, groupBy: group?.name, filter: filters },
      reading: group
        ? `How often ${humanize(flag.name)} is true, by ${humanize(group.name)}${filterNote}`
        : `How often ${humanize(flag.name)} is true overall${filterNote}`,
      sure: true,
    };
  }

  /* ── two periods ───────────────────────────────────────────── */
  if (/\b(vs|versus|compared? (?:to|with)|against)\b/.test(q) && dateCol) {
    const metric = numericMatches[0]?.col;
    const span = dateCol.temporal;
    if (span) {
      const mid = new Date((Date.parse(span.min) + Date.parse(span.max)) / 2).toISOString().slice(0, 10);
      return {
        plan: {
          op: "periods",
          dateColumn: dateCol.name,
          metric: metric?.name,
          stat: metric ? (pickStat(words, metric) as "median" | "count" | "sum") : "count",
          groupBy: explicitGroup?.name,
          a: { from: span.min, to: mid },
          b: { from: mid, to: span.max },
          filter: filters,
        },
        reading: `${metric ? humanize(metric.name) : "Row count"} in ${span.min}–${mid} against ${mid}–${span.max}${filterNote}`,
        sure: false,
      };
    }
  }

  /* ── over time ─────────────────────────────────────────────── */
  if (/\b(over time|trend|history|monthly|weekly|daily|by month|by week|by day|timeline|progression)\b/.test(q) && dateCol) {
    const metric = numericMatches[0]?.col;
    const stat = metric ? pickStat(words, metric) : "count";
    return {
      plan: {
        op: "series",
        dateColumn: dateCol.name,
        metric: metric?.name,
        stat: (stat === "sum" ? "sum" : stat === "count" ? "count" : "median"),
        filter: filters,
      },
      reading: `${metric ? `${stat} of ${humanize(metric.name)}` : "Row count"} over time${filterNote}`,
      sure: true,
    };
  }

  /* ── describe a column ─────────────────────────────────────── */
  if (
    /\b(describe|what is|whats in|tell me about|summar|breakdown of|profile)\b/.test(q) &&
    strongest >= 60
  ) {
    const col = matches[0].col;
    return {
      plan: { op: "describe", column: col.name },
      reading: `A profile of ${humanize(col.name)}`,
      sure: true,
    };
  }

  /* ── measure, optionally grouped ───────────────────────────── */
  const metric = explicitMetric ?? numericMatches[0]?.col;
  const counting = /\b(how many|count|number of|volume)\b/.test(q);

  if (metric || counting) {
    const target = metric ?? columns.find((c) => NUMERIC.has(c.kind));
    if (target) {
      const group = explicitGroup ?? (catMatches[0]?.col ?? undefined);
      const topN = /\b(?:top|bottom)\s+(\d+)\b/.exec(q);
      // "Top 5 categories by revenue" means total revenue, not typical
      // revenue per row — a ranking question is about size, not centre.
      const stat = counting ? "count" : topN && !/\b(average|avg|mean|median|typical)\b/.test(q)
        ? "sum"
        : pickStat(words, target);
      return {
        plan: {
          op: "aggregate",
          metric: target.name,
          stat,
          groupBy: group?.name,
          filter: filters,
          ...(topN ? { limit: Number(topN[1]) } : {}),
        },
        reading:
          stat === "count"
            ? group
              ? `Number of rows by ${humanize(group.name)}${filterNote}`
              : `Number of rows${filterNote}`
            : group
              ? `${stat} of ${humanize(target.name)} by ${humanize(group.name)}${filterNote}`
              : `${stat} of ${humanize(target.name)}${filterNote}`,
        sure: Boolean(metric),
      };
    }
  }

  /* ── a bare category: show its breakdown ───────────────────── */
  if (catMatches.length > 0) {
    const group = catMatches[0].col;
    const firstNumeric = columns.find((c) => NUMERIC.has(c.kind));
    if (firstNumeric) {
      return {
        plan: { op: "aggregate", metric: firstNumeric.name, stat: "count", groupBy: group.name, filter: filters },
        reading: `How many rows per ${humanize(group.name)}${filterNote}`,
        sure: false,
      };
    }
  }

  return unreadable(columns);
}

/**
 * A refusal that teaches rather than stonewalls.
 *
 * Built from the file's own columns, so the examples are questions this
 * dataset can actually answer rather than generic ones.
 */
function unreadable(columns: ColumnProfile[]): Unreadable {
  const num = columns.find((c) => NUMERIC.has(c.kind));
  const cat = columns.find((c) => c.kind === "category");
  const flag = columns.find((c) => c.kind === "boolean");
  const date = columns.find((c) => c.kind === "date");

  const examples: string[] = [];
  if (num && cat) examples.push(`average ${humanize(num.name)} by ${humanize(cat.name)}`);
  if (flag && cat) examples.push(`${humanize(flag.name)} rate by ${humanize(cat.name)}`);
  if (num && date) examples.push(`${humanize(num.name)} over time`);
  if (num && cat) examples.push(`why did ${humanize(num.name)} change`);
  if (num) examples.push(`total ${humanize(num.name)} last 3 months`);
  if (cat) examples.push(`describe ${humanize(cat.name)}`);

  return {
    error:
      "I couldn't match that to a column in your file. Try naming a column directly — the panel on the right lists them all.",
    examples: examples.slice(0, 4),
  };
}
