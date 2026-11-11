/**
 * Tables with known answers.
 *
 * Every generator here plants a pattern we can state in one sentence
 * before any detector runs, which is the only way a test of a
 * statistics engine means anything: if the fixture's truth is itself
 * the engine's output, the test passes forever and catches nothing.
 *
 * Deterministic on purpose — a seeded sequence, never Math.random, so
 * a failure is reproducible rather than a thing that happened once on
 * someone's laptop.
 */

/** mulberry32: small, fast, and identical on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = (base: string, offset: number) => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const toCsv = (header: string[], rows: (string | number)[][]) =>
  [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

/**
 * Two price populations whose *proportions* move, and nothing else.
 *
 * Cheap channel 27, dear channel 88, both drifting gently DOWN. The
 * cheap one's share falls from 55% to 35% halfway through. So:
 *   - the overall mean rises, while every channel falls  (a paradox)
 *   - the per-period MEDIAN leaps, because it crosses from one
 *     population into the other                          (an artefact)
 * The leap is the trap: it is a real number and a false finding.
 */
export function mixtureTable(n = 6000): string {
  const r = rng(11);
  const rows: (string | number)[][] = [];
  for (let i = 0; i < n; i++) {
    const offset = Math.floor(r() * 240);
    const date = day("2025-01-01", offset);
    const second = offset >= 150;
    const cheapShare = second ? 0.35 : 0.55;
    const pick = r();
    const channel = pick < cheapShare ? "Marketplace" : pick < cheapShare + 0.3 ? "Direct" : "Retail Partner";
    const base = channel === "Marketplace" ? 27 : channel === "Direct" ? 52 : 88;
    const price = base - (3 * offset) / 240 + (r() - 0.5) * 4;
    rows.push([date, channel, price.toFixed(2)]);
  }
  return toCsv(["order_date", "channel", "unit_price"], rows);
}

/** One population, a genuine 25% step on 2025-06-01. Must be found. */
export function honestStep(n = 4000): string {
  const r = rng(22);
  const rows: (string | number)[][] = [];
  for (let i = 0; i < n; i++) {
    const offset = Math.floor(r() * 240);
    const date = day("2025-01-01", offset);
    const level = offset >= 151 ? 50 : 40;
    rows.push([date, (level + (r() - 0.5) * 3).toFixed(2)]);
  }
  return toCsv(["order_date", "price"], rows);
}

/** Flat, uniform, featureless. Any finding here is a false positive. */
export function pureNoise(n = 4000): string {
  const r = rng(33);
  const rows: (string | number)[][] = [];
  for (let i = 0; i < n; i++) {
    const date = day("2025-01-01", Math.floor(r() * 240));
    rows.push([date, (40 + (r() - 0.5) * 3).toFixed(2)]);
  }
  return toCsv(["order_date", "price"], rows);
}

/**
 * Perfectly steady daily volume that happens to start and stop
 * mid-week, so the first and last weekly buckets are short. The only
 * "change" present is the calendar.
 */
export function partialPeriods(): string {
  const r = rng(44);
  const rows: (string | number)[][] = [];
  // 2025-01-01 is a Wednesday; 117 days later lands mid-week too.
  for (let d = 0; d < 117; d++) {
    for (let k = 0; k < 40; k++) {
      rows.push([day("2025-01-01", d), (50 + (r() - 0.5) * 2).toFixed(2)]);
    }
  }
  return toCsv(["order_date", "amount"], rows);
}

/** Nine rows of a straight line. Real fit, worthless claim. */
export function tinyTable(): string {
  const rows: (string | number)[][] = [];
  for (let g = 1; g <= 9; g++) rows.push([g, day("2025-01-01", g), (g * 1.5).toFixed(1)]);
  return toCsv(["id", "d", "v"], rows);
}

/** A sequential primary key beside a real metric. The key is not a metric. */
export function sequentialKey(n = 2000): string {
  const r = rng(55);
  const rows: (string | number)[][] = [];
  for (let i = 1; i <= n; i++) {
    rows.push([i, day("2025-01-01", Math.floor(r() * 200)), (60 + (r() - 0.5) * 8).toFixed(2)]);
  }
  return toCsv(["order_id", "order_date", "amount"], rows);
}

/** One category at 19% returned against ~5.5% everywhere else. */
export function segmentGap(n = 6000): string {
  const r = rng(66);
  const rows: (string | number)[][] = [];
  const regions = ["West", "East", "Central", "South"];
  for (let i = 0; i < n; i++) {
    const region = regions[Math.floor(r() * 4)];
    const rate = region === "West" ? 0.19 : 0.055;
    rows.push([
      day("2025-01-01", Math.floor(r() * 200)),
      region,
      r() < rate ? "true" : "false",
      (50 + (r() - 0.5) * 10).toFixed(2),
    ]);
  }
  return toCsv(["order_date", "region", "returned", "amount"], rows);
}

/** Three of nine values hold ~78% of the rows. */
export function concentrated(n = 6000): string {
  const r = rng(77);
  const names = ["Outerwear", "Footwear", "Accessories", "Knitwear", "Denim", "Eyewear", "Archive", "Bags", "Other"];
  const weights = [0.33, 0.28, 0.17, 0.08, 0.05, 0.035, 0.025, 0.02, 0.01];
  const rows: (string | number)[][] = [];
  for (let i = 0; i < n; i++) {
    let p = r();
    let k = 0;
    while (k < weights.length - 1 && p > weights[k]) { p -= weights[k]; k++; }
    rows.push([day("2025-01-01", Math.floor(r() * 200)), names[k], (40 + (r() - 0.5) * 6).toFixed(2)]);
  }
  return toCsv(["order_date", "category", "amount"], rows);
}

/** Three clear weeks with no rows at all, in the middle. */
export function hasGap(): string {
  const r = rng(88);
  const rows: (string | number)[][] = [];
  for (let d = 0; d < 180; d++) {
    if (d >= 80 && d < 101) continue; // the outage
    for (let k = 0; k < 30; k++) rows.push([day("2025-01-01", d), (50 + (r() - 0.5) * 4).toFixed(2)]);
  }
  return toCsv(["order_date", "amount"], rows);
}
