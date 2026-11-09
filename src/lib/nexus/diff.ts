import { humanize } from "./plain";
import type { Analysis, Finding, QualityIssue } from "./types";

/**
 * What changed since last time.
 *
 * This is the difference between a report and a product. A report is
 * read once and the transaction is over; something that says "three of
 * these are new since last month and one you fixed" is checked every
 * month, because it is tracking rather than describing. Nobody renews
 * a subscription to a thing that tells them what they already read.
 *
 * Findings carry stable ids — `shift:order_date:unit price` is the
 * same finding in March and in April — so two runs can be matched
 * without any fuzzy comparison of their wording. What moves between
 * runs is the impact score and the underlying numbers, and both are
 * worth reporting in different ways.
 */

export type ChangeKind = "new" | "worse" | "better" | "steady" | "resolved";

export interface FindingChange {
  id: string;
  kind: ChangeKind;
  headline: string;
  /** Impact then and now. Absent on `new`; `now` absent on `resolved`. */
  before?: number;
  now?: number;
  /** The figure the finding leads on, where both runs expose a comparable one. */
  movedFrom?: number;
  movedTo?: number;
}

export interface RunDiff {
  previousAt: string;
  previousRows: number;
  currentRows: number;
  changes: FindingChange[];
  counts: Record<ChangeKind, number>;
  /** New or worsened integrity problems, which matter more than findings. */
  newIssues: string[];
  resolvedIssues: string[];
  /** One line for the top of the panel. */
  summary: string;
}

/**
 * Impact is a composite, so small wobbles between runs are noise. A
 * fifth of the score is a change big enough that a person would
 * notice the finding had moved.
 */
const MATERIAL = 0.2;

/** The headline figure for a finding, where one is comparable across runs. */
function leadFigure(f: Finding): number | undefined {
  const e = f.evidence;
  for (const key of [
    "relativeChangePct",
    "totalChangePct",
    "overallChangePct",
    "segmentRatePct",
    "differencePct",
    "pointGapPct",
    "shareOfTotalPct",
    "top3SharePct",
    "missingPeriods",
  ]) {
    const v = e[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

export function diffRuns(
  previous: { findings: Finding[]; quality: QualityIssue[]; rowCount: number; createdAt: string },
  current: Analysis,
): RunDiff {
  const before = new Map(previous.findings.map((f) => [f.id, f]));
  const after = new Map(current.findings.map((f) => [f.id, f]));
  const changes: FindingChange[] = [];

  for (const [id, f] of after) {
    const old = before.get(id);
    if (!old) {
      changes.push({ id, kind: "new", headline: f.headline, now: f.impact, movedTo: leadFigure(f) });
      continue;
    }
    const delta = old.impact === 0 ? 0 : (f.impact - old.impact) / old.impact;
    const kind: ChangeKind = delta > MATERIAL ? "worse" : delta < -MATERIAL ? "better" : "steady";
    changes.push({
      id,
      kind,
      headline: f.headline,
      before: old.impact,
      now: f.impact,
      movedFrom: leadFigure(old),
      movedTo: leadFigure(f),
    });
  }

  for (const [id, f] of before) {
    if (!after.has(id)) {
      changes.push({ id, kind: "resolved", headline: f.headline, before: f.impact, movedFrom: leadFigure(f) });
    }
  }

  // Order by what a person should look at first.
  const rank: Record<ChangeKind, number> = { new: 0, worse: 1, resolved: 2, better: 3, steady: 4 };
  changes.sort((a, b) => rank[a.kind] - rank[b.kind] || (b.now ?? 0) - (a.now ?? 0));

  const counts = changes.reduce(
    (acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }),
    { new: 0, worse: 0, better: 0, steady: 0, resolved: 0 } as Record<ChangeKind, number>,
  );

  const prevIssues = new Set(previous.quality.map((q) => q.id));
  const nowIssues = new Set(current.quality.map((q) => q.id));
  const newIssues = current.quality.filter((q) => !prevIssues.has(q.id)).map((q) => q.title);
  const resolvedIssues = previous.quality.filter((q) => !nowIssues.has(q.id)).map((q) => q.title);

  return {
    previousAt: previous.createdAt,
    previousRows: previous.rowCount,
    currentRows: current.table.rows,
    changes,
    counts,
    newIssues,
    resolvedIssues,
    summary: summarise(counts, newIssues.length, resolvedIssues.length),
  };
}

function summarise(
  counts: Record<ChangeKind, number>,
  newIssues: number,
  resolvedIssues: number,
): string {
  const parts: string[] = [];
  if (counts.new) parts.push(`${counts.new} new`);
  if (counts.worse) parts.push(`${counts.worse} got worse`);
  if (counts.resolved) parts.push(`${counts.resolved} gone`);
  if (counts.better) parts.push(`${counts.better} eased`);
  if (newIssues) parts.push(`${newIssues} new data problem${newIssues === 1 ? "" : "s"}`);
  if (resolvedIssues) parts.push(`${resolvedIssues} data problem${resolvedIssues === 1 ? "" : "s"} fixed`);

  if (parts.length === 0) {
    return "Nothing material has changed since your last upload of this file.";
  }
  return `${parts.join(", ")} since your last upload.`;
}

/** Plain sentence for one change, used on the card badge's tooltip and in the digest. */
export function describeChange(c: FindingChange): string {
  const moved =
    c.movedFrom !== undefined && c.movedTo !== undefined && Math.abs(c.movedTo - c.movedFrom) >= 0.1
      ? ` It moved from ${round(c.movedFrom)} to ${round(c.movedTo)}.`
      : "";
  switch (c.kind) {
    case "new":
      return `This wasn't in your previous upload.${moved}`;
    case "worse":
      return `This was here last time and has got stronger.${moved}`;
    case "better":
      return `This was here last time and has eased off.${moved}`;
    case "resolved":
      return `This was in your previous upload and has gone.${moved}`;
    default:
      return `Unchanged since your previous upload.${moved}`;
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Column names inside a stable finding id, for display. */
export function prettyId(id: string): string {
  const parts = id.split(":").slice(1);
  return parts.map(humanize).join(" · ");
}
