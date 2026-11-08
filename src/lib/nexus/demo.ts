/**
 * The demo dataset.
 *
 * Generated rather than committed: a seeded PRNG means the same bytes
 * every time, so the findings are reproducible and there is no 400KB
 * CSV in the repo. The structure below is planted on purpose — each
 * pattern exists to prove a specific detector earns its place.
 *
 * What is hidden in here:
 *   · a Simpson's paradox on unit price — the total rises while every
 *     channel falls, because the mix moves toward the dear channels
 *   · a step change in fulfilment time partway through the window
 *   · a region whose return rate separates from the rest
 *   · a strong discount/volume relationship
 *   · a dozen bulk orders heavy enough to drag the mean off the median
 *   · nine categories where three carry most of the weight
 *   · and the usual mess: blanks, case variants, duplicates, a dead week
 */

/** mulberry32 — small, fast, and good enough that patterns read as noise. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHANNELS = [
  { name: "Marketplace", basePrice: 28, weightStart: 0.65, weightEnd: 0.25 },
  { name: "Direct", basePrice: 64, weightStart: 0.25, weightEnd: 0.42 },
  { name: "Retail Partner", basePrice: 92, weightStart: 0.1, weightEnd: 0.33 },
];

const REGIONS = ["Northeast", "Southeast", "Midwest", "West", "Southwest"];
const CATEGORIES = [
  "Outerwear", "Footwear", "Accessories", "Knitwear", "Denim",
  "Eyewear", "Bags", "Fragrance", "Archive",
];
// Deliberately lopsided: three categories carry most of the table.
const CATEGORY_WEIGHTS = [0.3, 0.27, 0.21, 0.07, 0.05, 0.035, 0.025, 0.015, 0.005];
const SEGMENTS = ["New", "Returning", "VIP", "Lapsed"];

const START = Date.UTC(2024, 6, 1);
const DAYS = 540;

/** Pick an index from a weight vector. */
function pick(r: number, weights: number[]): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r <= acc) return i;
  }
  return weights.length - 1;
}

/** Box–Muller, so the noise is normal rather than uniform. */
function gauss(rand: () => number, mu: number, sigma: number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const DEMO_NAME = "signal-commerce-18mo.csv";

export function buildDemoCsv(): string {
  const rand = rng(0x5eed1a);
  const rows: string[][] = [];

  // A dead week in month 9: the pipeline stopped, and a chart would draw
  // that as zero while an average would simply not see it.
  const outageStart = 280;
  const outageEnd = 301;

  let orderNo = 100000;

  for (let day = 0; day < DAYS; day++) {
    if (day >= outageStart && day <= outageEnd) continue;

    const t = day / (DAYS - 1);
    const date = new Date(START + day * 86400000);
    const iso = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();

    // Weekly rhythm plus slow growth, so volume is not flat noise.
    const weekend = dow === 0 || dow === 6 ? 0.68 : 1;
    const perDay = Math.max(1, Math.round(gauss(rand, 11 * weekend * (1 + 0.5 * t), 2.4)));

    // The mix walks from cheap channels toward dear ones across the window.
    const mix = CHANNELS.map((c) => c.weightStart + (c.weightEnd - c.weightStart) * t);
    const mixTotal = mix.reduce((a, b) => a + b, 0);
    const mixNorm = mix.map((m) => m / mixTotal);

    for (let k = 0; k < perDay; k++) {
      const ci = pick(rand(), mixNorm);
      const channel = CHANNELS[ci];

      // Every channel's own price drifts DOWN 12% across the window.
      // The total still rises, because the mix is moving faster than
      // the drift. That gap is the paradox.
      const drift = 1 - 0.12 * t;
      const unitPrice = Math.max(4, gauss(rand, channel.basePrice * drift, channel.basePrice * 0.17));

      // Discount drives volume — a real relationship to recover.
      const discount = Math.max(0, Math.min(55, gauss(rand, 12 + 10 * Math.sin(t * 5), 7)));
      const unitsBase = 1 + discount / 14;
      let units = Math.max(1, Math.round(gauss(rand, unitsBase, 0.8)));

      // A dozen wholesale orders, large enough to pull the mean off the median.
      if (rand() < 0.002) units = Math.round(180 + rand() * 620);

      const region = REGIONS[pick(rand(), [0.24, 0.22, 0.2, 0.19, 0.15])];
      const category = CATEGORIES[pick(rand(), CATEGORY_WEIGHTS)];

      // Fulfilment steps up at day 330: a carrier change, not a drift.
      const shippingBase = day < 330 ? 2.6 : 5.4;
      const shippingDays = Math.max(1, Math.round(gauss(rand, shippingBase, 1.1)));

      // The West's return rate separates from everywhere else.
      const returnRate = region === "West" ? 0.19 : 0.055;
      const returned = rand() < returnRate;

      const revenue = unitPrice * units * (1 - discount / 100);

      // 6% of segments are blank, and blanks are not evenly spread —
      // they cluster on new customers, which is what makes them lie.
      const segIdx = pick(rand(), [0.34, 0.33, 0.18, 0.15]);
      const segment = segIdx === 0 && rand() < 0.17 ? "" : SEGMENTS[segIdx];

      // Case and spacing variants, so one real region reads as three.
      let regionOut = region;
      if (region === "Midwest" && rand() < 0.08) regionOut = "midwest";
      if (region === "Southeast" && rand() < 0.05) regionOut = " Southeast";

      rows.push([
        `ORD-${orderNo++}`,
        iso,
        channel.name,
        regionOut,
        category,
        segment,
        unitPrice.toFixed(2),
        String(units),
        // A few unparseable discounts, the way an export actually arrives.
        rand() < 0.004 ? "n/a" : discount.toFixed(1),
        String(shippingDays),
        returned ? "true" : "false",
        revenue.toFixed(2),
      ]);
    }
  }

  // Fifteen exact duplicates, scattered rather than adjacent.
  for (let i = 0; i < 15; i++) {
    const src = Math.floor(rand() * rows.length);
    rows.push([...rows[src]]);
  }

  const headers = [
    "order_id", "order_date", "channel", "region", "category",
    "customer_segment", "unit_price", "units", "discount_pct",
    "shipping_days", "returned", "revenue",
  ];

  return [headers, ...rows].map((r) => r.join(",")).join("\n");
}
