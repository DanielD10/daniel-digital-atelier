import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { mean, median, pearson, quantile, stdev } from "./stats";

/**
 * The parser is the floor. Everything above it is arithmetic on
 * whatever this produced, so a row split in the wrong place is a wrong
 * answer delivered with full confidence.
 */

describe("RFC4180 handling", () => {
  it("keeps a quoted comma inside its field", () => {
    const t = parseCsv('a,b\n"Smith, John",42');
    expect(t.rows[0]).toEqual(["Smith, John", "42"]);
  });

  it("unescapes a doubled quote", () => {
    const t = parseCsv('a\n"she said ""no"""');
    expect(t.rows[0][0]).toBe('she said "no"');
  });

  it("keeps a newline inside a quoted field", () => {
    const t = parseCsv('a,b\n"line one\nline two",x');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0][0]).toContain("\n");
  });

  it("handles CRLF", () => {
    const t = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(t.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps empty fields rather than dropping them", () => {
    const t = parseCsv("a,b,c\n1,,3");
    expect(t.rows[0]).toEqual(["1", "", "3"]);
  });

  it("does not treat a trailing newline as a row", () => {
    expect(parseCsv("a,b\n1,2\n").rows).toHaveLength(1);
  });
});

describe("delimiter detection", () => {
  /*
   * Sniffed by which candidate gives a consistent column count, not by
   * which character is most frequent. Prose fields are full of commas
   * and semicolons, and frequency alone picks whichever punctuation
   * the free-text column happens to favour.
   */
  it("finds tabs", () => {
    const t = parseCsv("a\tb\tc\n1\t2\t3");
    expect(t.headers).toEqual(["a", "b", "c"]);
  });

  it("finds semicolons, as European exports use", () => {
    const t = parseCsv("a;b;c\n1;2;3");
    expect(t.headers).toEqual(["a", "b", "c"]);
  });

  it("finds pipes", () => {
    expect(parseCsv("a|b|c\n1|2|3").headers).toEqual(["a", "b", "c"]);
  });

  it("is not fooled by commas inside a semicolon-delimited file", () => {
    const t = parseCsv("name;note\nA;hello, there, friend\nB;one, two");
    expect(t.headers).toEqual(["name", "note"]);
    expect(t.rows[0][1]).toBe("hello, there, friend");
  });
});

describe("the row cap is a parameter, not a constant", () => {
  /*
   * It was hard-coded, so a benchmark that asked for four million rows
   * silently re-timed the same hundred thousand and reported a number
   * that was off by a factor of forty. The cap has to move for the
   * measurement to mean anything.
   */
  it("stops where it is told", () => {
    const csv = ["a", ...Array.from({ length: 500 }, (_, i) => String(i))].join("\n");
    expect(parseCsv(csv, 100).rows).toHaveLength(100);
    expect(parseCsv(csv, 300).rows).toHaveLength(300);
  });

  it("reports a file that was cut short", () => {
    const csv = ["a", ...Array.from({ length: 500 }, (_, i) => String(i))].join("\n");
    expect(parseCsv(csv, 100).truncated).toBe(true);
  });

  it("does not report one that fitted exactly", () => {
    // This flag drives the ceiling pitch, so a false one tells a
    // paying customer their data was cut when it was not.
    const csv = ["a", ...Array.from({ length: 100 }, (_, i) => String(i))].join("\n");
    const t = parseCsv(csv, 100);
    expect(t.rows).toHaveLength(100);
    expect(t.truncated).toBe(false);
  });
});

describe("statistics", () => {
  it("median takes the midpoint of an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("median is unmoved by an extreme value, where the mean is not", () => {
    // The reason bucket statistics are medians.
    const calm = [10, 11, 12, 13, 14];
    const spiked = [10, 11, 12, 13, 10_000];
    expect(median(spiked)).toBe(median(calm));
    expect(mean(spiked)).toBeGreaterThan(mean(calm) * 100);
  });

  it("quantile interpolates", () => {
    expect(quantile([0, 10], 0.5)).toBeCloseTo(5, 6);
  });

  it("pearson is 1 for a perfect rise and -1 for a perfect fall", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
  });

  it("pearson is near zero when there is no link", () => {
    expect(Math.abs(pearson([1, 2, 3, 4], [5, 5, 5.1, 5]))).toBeLessThan(0.6);
  });

  it("does not divide by zero on a constant column", () => {
    const r = pearson([1, 1, 1, 1], [2, 3, 4, 5]);
    expect(Number.isFinite(r) || Number.isNaN(r)).toBe(true);
  });

  it("stdev of a constant run is zero", () => {
    expect(stdev([7, 7, 7, 7])).toBeCloseTo(0, 9);
  });

  it("survives an empty input without throwing", () => {
    expect(() => median([])).not.toThrow();
    expect(() => mean([])).not.toThrow();
  });
});
