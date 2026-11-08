/**
 * Chart primitives, hand-built in SVG.
 *
 * No charting library. Every mark here is one of a handful of shapes,
 * and a dependency would cost more in bundle and styling fights than
 * it saves in code. It also means the panel can draw things a chart
 * library has no concept of — a change-point marker with the two
 * segment means behind it, a diverging bar set where the total
 * disagrees with every part.
 */

const PAD = 4;

function path(points: Array<[number, number]>): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
}

function extent(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  return [lo, hi];
}

export function Series({
  values,
  labels,
  markerIndex,
  height = 88,
  tone = "signal",
}: {
  values: number[];
  labels?: string[];
  markerIndex?: number;
  height?: number;
  tone?: "signal" | "warn" | "cool";
}) {
  if (values.length < 2) return null;
  const w = 100;
  const h = height;
  const [lo, hi] = extent(values);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (h - PAD * 2);

  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = path(pts);
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const id = `nxg-${tone}-${values.length}-${Math.round(lo)}`;

  // Segment means either side of a change point, drawn as the levels the
  // series actually ran at. The step is the finding; showing the two
  // plateaus is what makes it legible at a glance.
  let before: number | null = null;
  let after: number | null = null;
  if (markerIndex !== undefined && markerIndex > 0 && markerIndex < values.length) {
    const b = values.slice(0, markerIndex);
    const a = values.slice(markerIndex);
    before = b.reduce((s, v) => s + v, 0) / b.length;
    after = a.reduce((s, v) => s + v, 0) / a.length;
  }

  return (
    <svg
      className={`nex-chart nex-chart--${tone}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={
        labels && labels.length
          ? `Series from ${labels[0]} to ${labels[labels.length - 1]}`
          : "Series"
      }
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
      {before !== null && after !== null && markerIndex !== undefined && (
        <>
          <line
            x1="0" y1={y(before)} x2={x(markerIndex)} y2={y(before)}
            className="nex-chart-level"
          />
          <line
            x1={x(markerIndex)} y1={y(after)} x2={w} y2={y(after)}
            className="nex-chart-level"
          />
          <line
            x1={x(markerIndex)} y1="0" x2={x(markerIndex)} y2={h}
            className="nex-chart-marker"
          />
        </>
      )}
    </svg>
  );
}

/**
 * Diverging bars around a zero axis.
 *
 * Built for the paradox card, where the whole point is that one bar
 * points the other way from all the rest — so the zero line is the
 * subject of the chart, not furniture.
 */
export function Diverging({
  items,
  unit = "%",
  highlightFirst = false,
}: {
  items: Array<{ label: string; value: number; weight?: number }>;
  unit?: string;
  highlightFirst?: boolean;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1e-9);

  return (
    <ul className="nex-div">
      {items.map((item, i) => {
        const pctOfMax = (Math.abs(item.value) / max) * 50;
        const negative = item.value < 0;
        const lead = highlightFirst && i === 0;
        return (
          <li key={`${item.label}-${i}`} className={lead ? "nex-div-row is-lead" : "nex-div-row"}>
            <span className="nex-div-label" title={item.label}>{item.label}</span>
            <span className="nex-div-track">
              <span className="nex-div-axis" aria-hidden="true" />
              <span
                className={negative ? "nex-div-bar is-neg" : "nex-div-bar is-pos"}
                style={
                  negative
                    ? { right: "50%", width: `${pctOfMax}%` }
                    : { left: "50%", width: `${pctOfMax}%` }
                }
              />
            </span>
            <span className="nex-div-value">
              {item.value > 0 ? "+" : ""}
              {item.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              {unit}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Plain magnitude bars, for breakdowns that have no meaningful zero. */
export function Bars({
  items,
  unit = "",
}: {
  items: Array<{ label: string; value: number; weight?: number }>;
  unit?: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  const min = Math.min(...items.map((i) => i.value), 0);
  const span = max - min || 1;

  return (
    <ul className="nex-bars">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="nex-bars-row">
          <span className="nex-bars-label" title={item.label}>{item.label}</span>
          <span className="nex-bars-track">
            <span className="nex-bars-fill" style={{ width: `${((item.value - min) / span) * 100}%` }} />
          </span>
          <span className="nex-bars-value">
            {item.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A scatter cloud for a relationship finding.
 *
 * An r value is a summary that conceals its own shape: 0.6 can be an
 * even cloud, a curve, or a flat mass with two leverage points dragging
 * the line. Printing the coefficient without the picture asks the
 * reader to trust it; printing both lets them overrule it.
 */
export function Scatter({
  x,
  y,
  xLabel,
  yLabel,
  height = 150,
}: {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  if (x.length < 3) return null;
  const w = 240;
  const h = height;
  const [xlo, xhi] = extent(x);
  const [ylo, yhi] = extent(y);
  const px = (v: number) => PAD + ((v - xlo) / (xhi - xlo)) * (w - PAD * 2);
  const py = (v: number) => PAD + (1 - (v - ylo) / (yhi - ylo)) * (h - PAD * 2);

  return (
    <figure className="nex-scatter">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${yLabel} against ${xLabel}, ${x.length} sampled points`}
      >
        <line x1={PAD} y1={h - PAD} x2={w - PAD} y2={h - PAD} className="nex-scatter-axis" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={h - PAD} className="nex-scatter-axis" />
        {x.map((v, i) => (
          <circle key={i} cx={px(v)} cy={py(y[i])} r="1.6" className="nex-scatter-dot" />
        ))}
      </svg>
      <figcaption>
        <span>{yLabel}</span>
        <span className="nex-scatter-vs">against</span>
        <span>{xLabel}</span>
      </figcaption>
    </figure>
  );
}

/** The 24-bucket density strip shown against a numeric column. */
export function Histogram({ buckets }: { buckets: number[] }) {
  const max = Math.max(...buckets, 1);
  return (
    <span className="nex-hist" aria-hidden="true">
      {buckets.map((b, i) => (
        <span key={i} className="nex-hist-bar" style={{ height: `${Math.max(2, (b / max) * 100)}%` }} />
      ))}
    </span>
  );
}

/**
 * Impact, as a filled arc rather than a number.
 *
 * Impact is a composite of four terms and printing "0.73" invites
 * people to treat it as a measured quantity. A dial reads as what it
 * is: a ranking, not a measurement.
 */
export function Impact({ value }: { value: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0.03, Math.min(1, value)) * c;
  return (
    <svg className="nex-impact" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} className="nex-impact-track" />
      <circle
        cx="9" cy="9" r={r}
        className="nex-impact-fill"
        strokeDasharray={`${filled} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}
