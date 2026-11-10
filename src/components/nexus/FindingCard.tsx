"use client";

import { useState } from "react";
import { Bars, Diverging, Impact, Scatter, Series } from "./Charts";
import {
  briefing,
  chartCaption,
  EVIDENCE_PLAIN,
  howToRead,
  humanize,
  KIND_LABEL,
  plainMeaning,
} from "@/lib/nexus/plain";
import { describeChange, type FindingChange } from "@/lib/nexus/diff";
import type { Finding } from "@/lib/nexus/types";

/**
 * One finding, with its workings available.
 *
 * The expandable evidence is the whole argument of this project. A
 * dashboard that volunteers conclusions is only worth having if every
 * conclusion can be opened — the arithmetic that produced it, and the
 * actual rows it was computed from. "Show the work" is not a power-user
 * affordance here, it is what makes being assertive defensible.
 */


/** How sure, in words. A percentage here would be false precision. */
function confidenceWord(c: number): string {
  if (c >= 0.85) return "Strong";
  if (c >= 0.6) return "Clear";
  if (c >= 0.4) return "Tentative";
  return "Weak";
}

/**
 * `overallChangePct` → "Overall change %".
 *
 * The engine stores shares already multiplied out, because an audit
 * table reading "0.4909" next to a headline saying 49% makes a reader
 * stop and do arithmetic to check the two agree. The suffix is the
 * engine's signal that a figure is a percentage; this turns it into
 * the symbol rather than the word.
 */
function labelOf(key: string): string {
  const pct = key.endsWith("Pct");
  const base = pct ? key.slice(0, -3) : key;
  return (
    base
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (s) => s.toUpperCase())
      .toLowerCase()
      .replace(/^./, (s) => s.toUpperCase()) + (pct ? " %" : "")
  );
}

function formatValue(v: number | string): string {
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return v;
}

export interface AuditRows {
  headers: string[];
  rows: string[][];
  total: number;
}

const CHANGE_WORD: Record<FindingChange["kind"], string> = {
  new: "New",
  worse: "Worse",
  better: "Eased",
  steady: "Same",
  resolved: "Gone",
};

export default function FindingCard({
  finding,
  rank,
  onAudit,
  change,
}: {
  finding: Finding;
  rank: number;
  onAudit: (f: Finding) => Promise<AuditRows>;
  change?: FindingChange;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRows | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Long prose in the evidence map is a note, not a measurement; it reads
  // as a footnote rather than a row in the arithmetic table.
  const entries = Object.entries(finding.evidence);
  const notes = entries.filter(([, v]) => typeof v === "string" && v.length > 48);
  const figures = entries.filter(([, v]) => !(typeof v === "string" && v.length > 48));

  async function loadRows() {
    if (rows || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      setRows(await onAudit(finding));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const meaning = plainMeaning(finding);
  const caption = chartCaption(finding);
  const guide = howToRead(finding);
  const brief = briefing(finding);

  const isDiverging =
    finding.kind === "paradox" ||
    (finding.kind === "imbalance" && finding.breakdown?.some((b) => b.value < 0));

  return (
    <article className={`nex-find nex-find--${finding.kind}`}>
      <header className="nex-find-top">
        <span className="nex-find-rank">{String(rank).padStart(2, "0")}</span>
        <span className="nex-find-kind">{KIND_LABEL[finding.kind]}</span>
        {change && change.kind !== "steady" && (
          <span className={`nex-change nex-change--${change.kind}`} title={describeChange(change)}>
            {CHANGE_WORD[change.kind]}
          </span>
        )}
        <span className="nex-find-spacer" />
        <span className="nex-find-conf">{confidenceWord(finding.confidence)}</span>
        <Impact value={finding.impact} />
      </header>

      <h3 className="nex-find-head">{finding.headline}</h3>

      {meaning && <p className="nex-find-plain">{meaning}</p>}
      {change && change.kind !== "steady" && (
        <p className="nex-find-since">{describeChange(change)}</p>
      )}

      <p className="nex-find-cols">
        <span className="nex-find-cols-lead">from</span>
        {finding.columns.map((c) => (
          <span key={c} className="nex-chip" title={c}>{humanize(c)}</span>
        ))}
      </p>

      {finding.series && finding.series.values.length > 1 && (
        <div className="nex-find-chart">
          <Series
            values={finding.series.values}
            labels={finding.series.labels}
            markerIndex={finding.series.markerIndex}
            tone={finding.kind === "gap" ? "warn" : "signal"}
          />
          <div className="nex-find-axis">
            <span>{finding.series.labels[0]}</span>
            {finding.series.markerIndex !== undefined && (
              <span className="nex-find-axis-mark">
                {finding.series.labels[finding.series.markerIndex]}
              </span>
            )}
            <span>{finding.series.labels[finding.series.labels.length - 1]}</span>
          </div>
        </div>
      )}

      {finding.scatter && (
        <div className="nex-find-chart">
          <Scatter
            x={finding.scatter.x}
            y={finding.scatter.y}
            xLabel={finding.scatter.xLabel}
            yLabel={finding.scatter.yLabel}
          />
        </div>
      )}

      {finding.breakdown && finding.breakdown.length > 0 && (
        <div className="nex-find-chart">
          {isDiverging ? (
            <Diverging items={finding.breakdown} highlightFirst={finding.kind === "paradox"} />
          ) : (
            <Bars items={finding.breakdown} />
          )}
        </div>
      )}

      {/* The old one-liner only stands in where there is no fuller guide;
          side by side they said the same thing twice. */}
      {caption && !guide && <p className="nex-find-caption">{caption}</p>}

      {/*
        How to read the chart, inline rather than behind a toggle.
        Someone who already reads charts skips three short lines without
        effort; someone who does not would never have opened a panel
        labelled "how to read this", because opening it is admitting
        they cannot. The cost of showing it is far lower than the cost
        of hiding it from the person who needs it.
      */}
      {guide && (
        <dl className="nex-read">
          <div>
            <dt>Looking at</dt>
            <dd>{guide.looking}</dd>
          </div>
          <div>
            <dt>Read it</dt>
            <dd>{guide.read}</dd>
          </div>
          <div>
            <dt>Watch out</dt>
            <dd>{guide.mislead}</dd>
          </div>
        </dl>
      )}

      <section className="nex-pitch">
        <h4 className="nex-pitch-title">Taking this to someone</h4>
        <p className="nex-pitch-say">&ldquo;{brief.say}&rdquo;</p>
        <p className="nex-pitch-lead">What to do next</p>
        <ol className="nex-pitch-do">
          {brief.doNext.map((d: string) => (
            <li key={d}>{d}</li>
          ))}
        </ol>
        <p className="nex-pitch-sure">
          <span>How far this goes</span>
          {brief.certainty}
        </p>
      </section>

      <button
        type="button"
        className="nex-find-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nex-find-toggle-mark" aria-hidden="true">{open ? "−" : "+"}</span>
        {open ? "Hide the work" : "Show the work"}
      </button>

      {open && (
        <div className="nex-work">
          <dl className="nex-work-grid">
            {figures.map(([k, v]) => (
              <div key={k} className="nex-work-cell">
                <dt>{labelOf(k)}</dt>
                <dd>{formatValue(v)}</dd>
                {EVIDENCE_PLAIN[k] && <p className="nex-work-gloss">{EVIDENCE_PLAIN[k]}</p>}
              </div>
            ))}
          </dl>

          {notes.map(([k, v]) => (
            <p key={k} className="nex-work-note">{v as string}</p>
          ))}

          <p className="nex-work-meta">
            Based on {(finding.coverage * 100).toFixed(finding.coverage < 0.01 ? 2 : 0)}% of your rows
            {finding.rowRefs.length > 0 && ` · ${finding.rowRefs.length} cited`}
          </p>

          {/*
            Two ways rows get cited. An uploaded table cites exact row
            indices and can say how many. A database table cites a
            filter instead — there is no materialised table to index
            into — so the button offers a sample rather than a count.
            Either way the claim stays checkable, which is the point.
          */}
          {(finding.rowRefs.length > 0 || finding.sample) && !rows && (
            <button type="button" className="nex-find-rows-btn" onClick={loadRows} disabled={loading}>
              {loading
                ? "Fetching rows…"
                : finding.rowRefs.length > 0
                  ? `Open the ${finding.rowRefs.length} rows behind this`
                  : finding.sample?.column
                    ? `Show rows where ${humanize(finding.sample.column)} is ${finding.sample.value}`
                    : "Show rows from this table"}
            </button>
          )}
          {failed && <p className="nex-work-note">Couldn&apos;t fetch those rows. Try again.</p>}

          {rows && (
            <div className="nex-rows">
              <table>
                <thead>
                  <tr>
                    {rows.headers.map((h) => (
                      <th
                        key={h}
                        className={finding.columns.includes(h) ? "is-cited" : undefined}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, j) => (
                        <td
                          key={j}
                          className={
                            finding.columns.includes(rows.headers[j]) ? "is-cited" : undefined
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.total > rows.rows.length && (
                <p className="nex-work-note">
                  Showing {rows.rows.length} of {rows.total.toLocaleString()}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
