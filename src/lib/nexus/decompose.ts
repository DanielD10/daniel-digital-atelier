/**
 * Why a number moved.
 *
 * Every other detector in this engine reports *that* something changed.
 * This one answers the question anyone actually asks next, and it is
 * the hardest thing in commercial analytics to get right because the
 * intuitive answer is usually wrong.
 *
 * When an average moves, two independent things can have caused it:
 * each segment's own value changed (rate), or the balance between
 * segments changed (mix). They can point in opposite directions, and
 * when they do, the total tells you the reverse of what happened —
 * which is exactly the Simpson's paradox the panel already detects.
 * This quantifies it: how much of the move was mix, how much was rate,
 * and which segments carried each.
 *
 * The identity below is exact, not an approximation:
 *
 *   w_B·m_B − w_A·m_A
 *     = w_A·(m_B − m_A)          ← rate: same mix, new values
 *     + m_A·(w_B − w_A)          ← mix: same values, new balance
 *     + (w_B − w_A)·(m_B − m_A)  ← interaction: both moved together
 *
 * Summed over segments the three terms add to the total change with no
 * residual, which is what makes the result safe to show as percentages
 * of the move.
 */

export interface SegmentDriver {
  label: string;
  /** Share of rows in each period, 0–1. */
  shareBefore: number;
  shareAfter: number;
  /** Segment mean in each period. */
  valueBefore: number;
  valueAfter: number;
  /** This segment's share of the total change, as a percentage. */
  contributionPct: number;
  rowsBefore: number;
  rowsAfter: number;
}

export interface Decomposition {
  before: number;
  after: number;
  delta: number;
  /** The three exact components, in metric units. */
  rateEffect: number;
  mixEffect: number;
  interactionEffect: number;
  /** Components as a share of |delta|, for reading at a glance. */
  ratePct: number;
  mixPct: number;
  interactionPct: number;
  segments: SegmentDriver[];
  /** True when mix and rate pull opposite ways — the paradox case. */
  opposed: boolean;
}

export interface PeriodSlice {
  /** Metric value per row; NaN where missing. */
  values: Float64Array;
  /** Segment code per row; negative where blank. */
  codes: Int32Array;
  levels: string[];
  /** Period membership per row. */
  inBefore: (r: number) => boolean;
  inAfter: (r: number) => boolean;
  rows: number;
}

export function decompose(slice: PeriodSlice): Decomposition | null {
  const { values, codes, levels, inBefore, inAfter, rows } = slice;
  const k = levels.length;
  if (k === 0) return null;

  const sumA = new Float64Array(k);
  const sumB = new Float64Array(k);
  const nA = new Int32Array(k);
  const nB = new Int32Array(k);
  let totalA = 0;
  let totalB = 0;

  for (let r = 0; r < rows; r++) {
    const v = values[r];
    if (Number.isNaN(v)) continue;
    const c = codes[r];
    if (c < 0 || c >= k) continue;
    if (inBefore(r)) {
      sumA[c] += v;
      nA[c]++;
      totalA++;
    } else if (inAfter(r)) {
      sumB[c] += v;
      nB[c]++;
      totalB++;
    }
  }
  if (totalA < 10 || totalB < 10) return null;

  let before = 0;
  let after = 0;
  let rateEffect = 0;
  let mixEffect = 0;
  let interactionEffect = 0;
  const segments: SegmentDriver[] = [];

  for (let c = 0; c < k; c++) {
    // A segment absent from one period has no mean there. Treating the
    // gap as zero would invent a collapse that never happened, so it
    // inherits the other period's value and contributes through mix
    // alone — which is the truthful reading: it appeared, or it left.
    const hasA = nA[c] > 0;
    const hasB = nB[c] > 0;
    if (!hasA && !hasB) continue;

    const mA = hasA ? sumA[c] / nA[c] : sumB[c] / nB[c];
    const mB = hasB ? sumB[c] / nB[c] : sumA[c] / nA[c];
    const wA = nA[c] / totalA;
    const wB = nB[c] / totalB;

    before += wA * mA;
    after += wB * mB;

    const rate = wA * (mB - mA);
    const mix = mA * (wB - wA);
    const inter = (wB - wA) * (mB - mA);
    rateEffect += rate;
    mixEffect += mix;
    interactionEffect += inter;

    segments.push({
      label: levels[c],
      shareBefore: wA,
      shareAfter: wB,
      valueBefore: mA,
      valueAfter: mB,
      contributionPct: rate + mix + inter,
      rowsBefore: nA[c],
      rowsAfter: nB[c],
    });
  }

  const delta = after - before;
  if (!Number.isFinite(delta)) return null;

  const scale = Math.abs(delta) < 1e-12 ? 1 : Math.abs(delta);
  for (const s of segments) s.contributionPct = (s.contributionPct / scale) * 100;
  segments.sort((a, b) => Math.abs(b.contributionPct) - Math.abs(a.contributionPct));

  return {
    before,
    after,
    delta,
    rateEffect,
    mixEffect,
    interactionEffect,
    ratePct: (rateEffect / scale) * 100,
    mixPct: (mixEffect / scale) * 100,
    interactionPct: (interactionEffect / scale) * 100,
    segments,
    // Only meaningful when both are big enough to matter; two tiny
    // opposing effects are noise, not a paradox.
    opposed:
      Math.sign(rateEffect) !== Math.sign(mixEffect) &&
      Math.abs(rateEffect) > scale * 0.15 &&
      Math.abs(mixEffect) > scale * 0.15,
  };
}

/** One-line summary of what moved the number. */
export function explain(d: Decomposition, metric: string, segment: string): string {
  const dir = d.delta > 0 ? "up" : "down";
  if (d.opposed) {
    const mixWon = Math.abs(d.mixPct) > Math.abs(d.ratePct);
    return (
      `${metric} went ${dir} because the mix of ${segment} shifted, not because ` +
      `${segment} values moved — the balance contributed ${d.mixPct.toFixed(0)}% of the change ` +
      `while the values themselves pulled ${d.ratePct.toFixed(0)}% the other way` +
      (mixWon ? "." : ", and the two nearly cancelled.")
    );
  }
  return Math.abs(d.mixPct) > Math.abs(d.ratePct)
    ? `${metric} went ${dir} mostly through a change in the mix of ${segment} (${d.mixPct.toFixed(0)}% of the move).`
    : `${metric} went ${dir} mostly because ${segment} values themselves changed (${d.ratePct.toFixed(0)}% of the move).`;
}
