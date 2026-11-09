/**
 * What a given visitor is allowed to do.
 *
 * Three tiers, one seam. `anonymous` is what a stranger gets, and it is
 * deliberately generous: the sample is unlimited and uploads get the
 * full engine, every finding and the whole audit trail. What it does
 * not get is anything that costs money per call.
 *
 * `identified` is unlocked by giving a name and an email, which is the
 * lead — the same person lands in the enquiry store and the inbox. That
 * turns the one expensive feature into the capture rather than a cost
 * centre.
 *
 * `pro` is wired through everywhere and nothing grants it yet. When
 * billing goes in, the change is a write to nexus_access.tier, not an
 * edit to every gate in the codebase.
 */

export type Tier = "anonymous" | "identified" | "pro";

export interface Entitlements {
  tier: Tier;
  /** Largest single upload. */
  maxBytes: number;
  maxRows: number;
  /** Datasets kept per session; older ones are trimmed. */
  maxDatasets: number;
  /**
   * Daily allowances, metered server-side by nexus_spend(). No tier
   * has a capability another tier lacks — only a smaller number of
   * them per day. A free visitor can see everything this does work.
   */
  briefsPerDay: number;
  asksPerDay: number;
  label: string;
}

const MB = 1024 * 1024;

/*
 * These numbers are measured, not chosen.
 *
 * On the current in-memory engine, with a 11-column commercial table:
 *   250k rows  →  ~5s,  ~200MB heap
 *   500k rows  → ~10s,  ~400MB heap
 *     1M rows  → ~20s,  ~740MB heap
 *     2M rows  → ~40s,  ~1.4GB heap
 *     4M rows  → out of memory
 *
 * The binding constraint is that the parser materialises the table as
 * string[][] — eleven million JavaScript strings at a million rows,
 * which is most of that heap. Typed arrays for the derived numeric and
 * date views cut the downstream cost but cannot touch the source
 * representation.
 *
 * Free sits well inside the comfortable band so the sampler always
 * feels instant. Pro sits at the measured safe edge with headroom for
 * a wider table. Past that is a different engine, not a bigger number
 * here: columnar parsing for tens of millions of rows, and pushing the
 * detectors down into SQL for anything warehouse-scale.
 */

export const TIERS: Record<Tier, Entitlements> = {
  anonymous: {
    tier: "anonymous",
    maxBytes: 5 * MB,
    maxRows: 50_000,
    maxDatasets: 3,
    briefsPerDay: 2,
    asksPerDay: 3,
    label: "Free",
  },
  identified: {
    tier: "identified",
    maxBytes: 5 * MB,
    maxRows: 50_000,
    maxDatasets: 3,
    briefsPerDay: 8,
    asksPerDay: 25,
    label: "Unlocked",
  },
  pro: {
    tier: "pro",
    maxBytes: 60 * MB,
    maxRows: 750_000,
    maxDatasets: 100,
    briefsPerDay: 500,
    asksPerDay: 500,
    label: "Pro",
  },
};

export function entitlementsFor(tier: Tier): Entitlements {
  return TIERS[tier] ?? TIERS.anonymous;
}

/**
 * What sits on the other side of the ceiling.
 *
 * Shown verbatim where a limit bites. It is a pitch, so it says what
 * changes rather than what is forbidden — the wall is the most
 * attentive moment a visitor will give this page.
 */
export const BEYOND = {
  heading: "This is the sampler",
  body:
    "Everything above ran in the browser's round trip against a 5MB slice. The same engine runs against live warehouses — Postgres, BigQuery, Snowflake — on a schedule, posting what changed into Slack before anyone opens a dashboard.",
  points: [
    "Your own sources, not an upload",
    "Scheduled sweeps, alerts on what moved",
    "Detectors written for your domain",
    "The findings API behind your own front end",
  ],
  cta: "Talk about your data",
} as const;
