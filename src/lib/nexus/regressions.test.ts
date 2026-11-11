import { describe, expect, it } from "vitest";
import { analyzeCsv } from "./analyze";
import { LIMITS } from "./types";
import {
  concentrated,
  hasGap,
  honestStep,
  mixtureTable,
  partialPeriods,
  pureNoise,
  segmentGap,
  sequentialKey,
  tinyTable,
} from "./__fixtures__";

/**
 * Every test in this file is a false finding this engine actually
 * produced, written down so it cannot come back.
 *
 * They are worth more than the tests that check a detector fires. A
 * detector that stops firing is a quiet product; a detector that
 * invents a 117% price rise is a client acting on something that did
 * not happen, and that is the failure that ends a contract.
 */

const run = (csv: string) => analyzeCsv(csv).analysis;
const kinds = (csv: string) => run(csv).findings.map((f) => f.kind);
const about = (csv: string, column: string) =>
  run(csv).findings.filter((f) => f.columns.includes(column));

describe("the mixture artefact", () => {
  /*
   * Shipped live on the demo page: "unit price has moved up 117%
   * steadily" printed directly underneath "unit price is up 49%
   * overall while every channel moved the other way". The per-bucket
   * median had crossed from the cheap population into the dear one.
   * The number was real. The claim was nonsense.
   */
  it("does not report a step or trend in a metric whose mix moved", () => {
    const found = about(mixtureTable(), "unit_price").map((f) => f.kind);
    expect(found).not.toContain("shift");
    expect(found).not.toContain("trend");
  });

  it("still reports the paradox, which is the true account of it", () => {
    expect(kinds(mixtureTable())).toContain("paradox");
  });

  it("decomposes exactly: the three effects account for the whole move", () => {
    // They are expressed as shares of the change, so they sum to 100%
    // with nothing left over. That identity is what lets the card say
    // "the mix contributed 121% while the values pulled -20% back".
    const p = run(mixtureTable()).findings.find((f) => f.kind === "paradox");
    expect(p).toBeDefined();
    const e = p!.evidence;
    const parts = Number(e.mixEffectPct) + Number(e.rateEffectPct) + Number(e.interactionPct);
    expect(parts).toBeCloseTo(100, 0);
  });

  it("the guard does not eat a real step in a single population", () => {
    // The whole risk of suppressing claims is suppressing true ones.
    expect(kinds(honestStep())).toContain("shift");
  });
});

describe("partial first and last periods", () => {
  /*
   * "Row volume rose 9.3% and stayed there" on perfectly uniform
   * volume, because the opening week held five days of seven. The
   * ratio test written first let it through at 73% of a normal week,
   * so the trim is now an exact calendar comparison.
   */
  it("does not invent a volume change from a short opening or closing week", () => {
    const volume = run(partialPeriods()).findings.filter(
      (f) => f.kind === "shift" || f.kind === "trend",
    );
    expect(volume).toHaveLength(0);
  });
});

describe("samples too small to speak", () => {
  /*
   * Nine rows of a sequential column gave "ID has moved up 800%
   * steadily" at an impact of 1.00. The fit is real — a line through
   * nine points has an r² of 1 — and the claim is worthless.
   */
  it("reports nothing at all below the row floor", () => {
    expect(run(tinyTable()).findings).toHaveLength(0);
  });

  it("says why, rather than going quiet", () => {
    const q = run(tinyTable()).quality;
    expect(q.some((i) => i.id === "too-few-rows")).toBe(true);
  });

  it("the floor is the documented one", () => {
    expect(LIMITS.minRowsForFindings).toBe(30);
  });
});

describe("identifiers are not measurements", () => {
  /*
   * A sequential primary key was profiled as an integer metric, so the
   * detectors computed the median and correlations of a row number.
   * On a 1.2M-row warehouse table that was four of the five slowest
   * queries in the run, and every result was discarded by ranking
   * afterwards.
   */
  it("classifies a sequential key as an identifier", () => {
    const col = run(sequentialKey()).columns.find((c) => c.name === "order_id");
    expect(col?.kind).toBe("identifier");
  });

  it("never reports a finding about one", () => {
    expect(about(sequentialKey(), "order_id")).toHaveLength(0);
  });
});

describe("silence on featureless data", () => {
  it("finds nothing in noise", () => {
    // A tool that always finds something is a tool nobody can trust
    // when it finds something.
    expect(run(pureNoise()).findings).toHaveLength(0);
  });
});

describe("the detectors still fire on what they are for", () => {
  it("finds a real level shift", () => {
    const f = run(honestStep()).findings.find((x) => x.kind === "shift");
    expect(f).toBeDefined();
    // 40 to 50 is 25%; allow room for bucket medians.
    expect(Math.abs(Number(f!.evidence.relativeChangePct))).toBeGreaterThan(15);
  });

  it("finds a segment running far off the rest", () => {
    const f = run(segmentGap()).findings.find(
      (x) => x.kind === "imbalance" || x.kind === "relationship",
    );
    expect(f).toBeDefined();
    expect(JSON.stringify(f!.evidence) + f!.headline).toContain("West");
  });

  it("finds concentration, and counts it right", () => {
    const f = run(concentrated()).findings.find((x) => x.kind === "concentration");
    expect(f).toBeDefined();
    expect(Number(f!.evidence.top3SharePct)).toBeGreaterThan(70);
    expect(Number(f!.evidence.top3SharePct)).toBeLessThan(85);
  });

  it("finds a hole in the coverage", () => {
    const f = run(hasGap()).findings.find((x) => x.kind === "gap");
    expect(f).toBeDefined();
    expect(f!.evidence.longestGapFrom).toBeTruthy();
    expect(f!.evidence.longestGapTo).toBeTruthy();
  });
});

describe("determinism", () => {
  it("gives the same answer twice", () => {
    // Sampling lives inside several detectors. If a client runs the
    // same file on Tuesday and gets a different panel, nothing else
    // here matters.
    const a = run(mixtureTable());
    const b = run(mixtureTable());
    expect(b.findings.map((f) => f.id + f.headline)).toEqual(
      a.findings.map((f) => f.id + f.headline),
    );
  });
});
