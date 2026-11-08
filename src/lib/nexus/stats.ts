/**
 * Statistical primitives.
 *
 * Everything here is robust by preference: medians over means, MAD over
 * standard deviation, rank correlation alongside linear. A dashboard
 * that volunteers conclusions has to survive the one column with a
 * fat tail, and classical moments do not.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(xs: number[]): number {
  return quantile([...xs].sort((a, b) => a - b), 0.5);
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (xs.length - 1));
}

/**
 * Median absolute deviation, scaled by 1.4826 so that for normal data it
 * estimates the same quantity as the standard deviation — which makes
 * "three sigma" thresholds mean the same thing without inheriting the
 * standard deviation's habit of being inflated by the outliers it is
 * supposed to be detecting.
 */
export function mad(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Average ranks, so ties don't manufacture correlation. */
export function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k].i] = r;
    i = j + 1;
  }
  return out;
}

/** Monotone association. Catches curved relationships Pearson misses. */
export function spearman(xs: number[], ys: number[]): number {
  return pearson(ranks(xs), ranks(ys));
}

/**
 * Two-sided p-value for a correlation, via the t transform.
 *
 * Approximate, but the job here is ranking rather than publication: it
 * has to separate "fifty rows and r=0.3" from "nine rows and r=0.9",
 * and for that an approximation is plenty.
 */
export function correlationP(r: number, n: number): number {
  if (n < 4 || Math.abs(r) >= 1) return 0;
  const t = Math.abs(r) * Math.sqrt((n - 2) / (1 - r * r));
  return 2 * (1 - studentCdf(t, n - 2));
}

/** Student's t CDF through the regularised incomplete beta function. */
function studentCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta =
    logGamma(a) + logGamma(b) - logGamma(a + b);
  const front =
    Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  // Lentz's continued fraction.
  let f = 1;
  let c = 1;
  let d = 0;
  for (let i = 0; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -(((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-10) break;
  }
  return front * (f - 1);
}

function logGamma(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Ordinary least squares, plus the R² the UI reports alongside it. */
export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const r = pearson(xs, ys);
  return { slope, intercept, r2: r * r };
}

export interface ChangePoint {
  index: number;
  before: number;
  after: number;
  /** Standardised size of the step, in robust sigmas. */
  magnitude: number;
}

/**
 * Find the single best split point in a series.
 *
 * Exhaustive two-segment search rather than CUSUM: the series here are
 * aggregated periods, so there are tens or hundreds of candidates, not
 * millions, and scanning them all gives an exact answer with no tuning
 * parameters to get wrong. The score is the standardised difference of
 * segment means, which is what makes it comparable across columns with
 * completely different units.
 */
export function changePoint(values: number[], minSegment = 3): ChangePoint | null {
  const n = values.length;
  if (n < minSegment * 2) return null;

  const spread = mad(values) || stdev(values);
  if (spread === 0) return null;

  let best: ChangePoint | null = null;
  for (let i = minSegment; i <= n - minSegment; i++) {
    const before = values.slice(0, i);
    const after = values.slice(i);
    const mb = mean(before);
    const ma = mean(after);
    // Pooled standard error of the difference between the two means.
    const se = spread * Math.sqrt(1 / before.length + 1 / after.length);
    const magnitude = se === 0 ? 0 : Math.abs(ma - mb) / se;
    if (!best || magnitude > best.magnitude) {
      best = { index: i, before: mb, after: ma, magnitude };
    }
  }
  return best;
}

/**
 * Two-sample Kolmogorov–Smirnov statistic: the largest gap between two
 * empirical distributions. Unlike comparing means it notices when the
 * centre holds but the shape changes — a spread that doubles, or a
 * second mode appearing.
 */
export function ksStatistic(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < sa.length && j < sb.length) {
    const v = Math.min(sa[i], sb[j]);
    while (i < sa.length && sa[i] <= v) i++;
    while (j < sb.length && sb[j] <= v) j++;
    d = Math.max(d, Math.abs(i / sa.length - j / sb.length));
  }
  return d;
}

/** Asymptotic p-value for the KS statistic. */
export function ksP(d: number, n1: number, n2: number): number {
  const ne = (n1 * n2) / (n1 + n2);
  const lambda = (Math.sqrt(ne) + 0.12 + 0.11 / Math.sqrt(ne)) * d;
  let sum = 0;
  for (let k = 1; k <= 100; k++) {
    sum += (k % 2 === 0 ? -1 : 1) * Math.exp(-2 * k * k * lambda * lambda);
  }
  return Math.max(0, Math.min(1, 2 * sum));
}

/** Normalised Shannon entropy: 0 when one level dominates, 1 when even. */
export function balance(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0 || counts.length < 2) return 0;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(counts.length);
}

/** Share of the total held by the largest levels — a concentration read. */
export function topShare(counts: number[], k: number): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const sorted = [...counts].sort((a, b) => b - a);
  return sorted.slice(0, k).reduce((a, b) => a + b, 0) / total;
}

export function histogram(xs: number[], buckets: number): number[] {
  const out = new Array<number>(buckets).fill(0);
  if (xs.length === 0) return out;
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (lo === hi) {
    out[Math.floor(buckets / 2)] = xs.length;
    return out;
  }
  for (const x of xs) {
    const b = Math.min(buckets - 1, Math.floor(((x - lo) / (hi - lo)) * buckets));
    out[b]++;
  }
  return out;
}
