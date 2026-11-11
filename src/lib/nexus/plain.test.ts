import { describe, expect, it } from "vitest";
import { analyzeCsv } from "./analyze";
import { briefing, chartCaption, howToRead, plainMeaning } from "./plain";
import { buildDemoCsv } from "./demo";
import type { Finding } from "./types";
import {
  concentrated,
  hasGap,
  honestStep,
  mixtureTable,
  segmentGap,
} from "./__fixtures__";

/**
 * The guarantee here is narrow and absolute: nothing this layer emits
 * ever contains a hole.
 *
 * A finding whose briefing reads "from undefined to undefined" is
 * worse than no briefing, because someone is going to read it out in a
 * meeting. Every one of these was a real defect — gap used the wrong
 * two evidence keys, concentration used three wrong ones, and the
 * shift briefing named the date column while quoting the metric's
 * numbers.
 */

const HOLES = [/undefined/, /\bNaN\b/, /\[object [A-Z]/, /\bnull\b/];

function collect(): Finding[] {
  const out: Finding[] = [];
  // The demo is in here on purpose: it is the page every visitor
  // lands on, so its copy is the copy most likely to be read.
  for (const csv of [buildDemoCsv(), mixtureTable(), honestStep(), segmentGap(), concentrated(), hasGap()]) {
    out.push(...analyzeCsv(csv).analysis.findings);
  }
  return out;
}

const findings = collect();

describe("the findings used for these tests cover the detectors", () => {
  it("includes several distinct kinds", () => {
    const kinds = new Set(findings.map((f) => f.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });

  it("produced something to check at all", () => {
    expect(findings.length).toBeGreaterThan(15);
  });
});

describe("no placeholder ever reaches a reader", () => {
  const check = (label: string, text: string, f: Finding) => {
    for (const hole of HOLES) {
      expect(
        hole.test(text),
        `${label} for [${f.kind}] "${f.headline}" contains ${hole}:\n  ${text}`,
      ).toBe(false);
    }
  };

  it("holds for the plain meaning", () => {
    for (const f of findings) check("plainMeaning", plainMeaning(f), f);
  });

  it("holds for the chart caption", () => {
    for (const f of findings) {
      const c = chartCaption(f);
      if (c) check("chartCaption", c, f);
    }
  });

  it("holds for the reading guide", () => {
    for (const f of findings) {
      const g = howToRead(f);
      if (!g) continue;
      check("looking", g.looking, f);
      check("read", g.read, f);
      check("mislead", g.mislead, f);
    }
  });

  it("holds for the briefing", () => {
    for (const f of findings) {
      const b = briefing(f);
      check("say", b.say, f);
      check("certainty", b.certainty, f);
      b.doNext.forEach((d, i) => check(`doNext[${i}]`, d, f));
    }
  });
});

describe("the briefing is usable as written", () => {
  it("gives every finding a sentence, actions and a caution", () => {
    for (const f of findings) {
      const b = briefing(f);
      expect(b.say.length, `say too short for ${f.kind}`).toBeGreaterThan(40);
      expect(b.doNext.length, `no actions for ${f.kind}`).toBeGreaterThanOrEqual(2);
      expect(b.certainty.length, `no caution for ${f.kind}`).toBeGreaterThan(40);
    }
  });

  it("starts the spoken line with a capital", () => {
    // Several are built from a column name, which arrives lower-case.
    for (const f of findings) {
      const first = briefing(f).say[0];
      expect(first, `"${briefing(f).say.slice(0, 30)}…"`).toBe(first.toUpperCase());
    }
  });

  it("names the metric in a time finding, not the date column", () => {
    /*
     * The bug this locks down: a shift finding lists its date column
     * first, so reading columns[0] produced "order date stepped from
     * 2.74 to 5.16" — the metric's numbers under the date's name.
     */
    const shift = analyzeCsv(honestStep()).analysis.findings.find((f) => f.kind === "shift");
    expect(shift).toBeDefined();
    const say = briefing(shift!).say.toLowerCase();
    expect(say).toContain("price");
    expect(say).not.toContain("order date");
  });

  it("does not claim a fitted line predicts anything", () => {
    // The one place this product could get someone in real trouble.
    for (const f of findings.filter((x) => x.kind === "trend")) {
      expect(briefing(f).certainty.toLowerCase()).toContain("not a forecast");
    }
  });
});

describe("the reading guide explains the marks on the page", () => {
  it("is present whenever there is something to look at", () => {
    for (const f of findings) {
      if (f.series || f.scatter || f.breakdown) {
        expect(howToRead(f), `no guide for [${f.kind}] ${f.headline}`).not.toBeNull();
      }
    }
  });

  it("names both axes of a scatter", () => {
    const rel = findings.find((f) => f.scatter);
    if (!rel) return;
    const g = howToRead(rel)!;
    expect(g.looking).toContain("along the bottom");
    expect(g.looking).toContain("up the side");
  });

  it("always warns that a correlation is not a cause", () => {
    for (const f of findings.filter((x) => x.scatter)) {
      expect(howToRead(f)!.mislead.toLowerCase()).toContain("cause");
    }
  });
});
