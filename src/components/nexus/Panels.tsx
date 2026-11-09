"use client";

import { useState } from "react";
import { Histogram } from "./Charts";
import { humanize, KIND_PLAIN } from "@/lib/nexus/plain";
import type { ColumnProfile, QualityIssue } from "@/lib/nexus/types";

/** Side panels: what the data is, and what's wrong with it. */

const KIND_TAG: Record<ColumnProfile["kind"], string> = {
  number: "num",
  integer: "int",
  currency: "cur",
  percent: "pct",
  date: "date",
  boolean: "bool",
  category: "cat",
  identifier: "id",
  text: "text",
  empty: "—",
};

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function ColumnRail({ columns }: { columns: ColumnProfile[] }) {
  const [openCol, setOpenCol] = useState<string | null>(null);

  return (
    <section className="nex-rail">
      <h2 className="nex-rail-title">Schema</h2>
      <p className="nex-rail-sub">
        What each column holds, worked out from the values rather than the
        heading. Open one to see its range and most common entries.
      </p>
      <ul className="nex-cols">
        {columns.map((c) => {
          const open = openCol === c.name;
          return (
            <li key={c.name} className={open ? "nex-col is-open" : "nex-col"}>
              <button
                type="button"
                className="nex-col-head"
                aria-expanded={open}
                onClick={() => setOpenCol(open ? null : c.name)}
              >
                <span
                  className={`nex-col-kind nex-col-kind--${c.kind}`}
                  title={`Read as ${KIND_PLAIN[c.kind]}`}
                >
                  {KIND_TAG[c.kind]}
                </span>
                <span className="nex-col-name" title={c.name}>{humanize(c.name)}</span>
                {c.numeric && <Histogram buckets={c.numeric.histogram} />}
                {c.missing > 0.001 && (
                  <span className="nex-col-missing" title={`${(c.missing * 100).toFixed(1)}% empty`}>
                    {(c.missing * 100).toFixed(0)}%
                  </span>
                )}
              </button>

              {open && (
                <div className="nex-col-body">
                  {c.numeric && (
                    <dl className="nex-col-stats">
                      <div><dt>min</dt><dd>{compact(c.numeric.min)}</dd></div>
                      <div><dt>median</dt><dd>{compact(c.numeric.median)}</dd></div>
                      <div><dt>mean</dt><dd>{compact(c.numeric.mean)}</dd></div>
                      <div><dt>max</dt><dd>{compact(c.numeric.max)}</dd></div>
                      <div><dt title="Typical distance from the middle value">spread</dt><dd>{compact(c.numeric.mad)}</dd></div>
                      <div><dt title="Values far outside the usual range">extremes</dt><dd>{c.numeric.outlierCount}</dd></div>
                    </dl>
                  )}
                  {c.temporal && (
                    <dl className="nex-col-stats">
                      <div><dt>from</dt><dd>{c.temporal.min}</dd></div>
                      <div><dt>to</dt><dd>{c.temporal.max}</dd></div>
                      <div><dt>span</dt><dd>{c.temporal.spanDays}d</dd></div>
                      <div><dt title="Typical gap between dates">every</dt><dd>{c.temporal.cadenceDays}d</dd></div>
                    </dl>
                  )}
                  {c.categorical && (
                    <ul className="nex-levels">
                      {c.categorical.top.slice(0, 6).map((t) => (
                        <li key={t.value}>
                          <span className="nex-levels-name" title={t.value}>{t.value || "(blank)"}</span>
                          <span className="nex-levels-count">{t.count.toLocaleString()}</span>
                        </li>
                      ))}
                      {c.categorical.distinct > 6 && (
                        <li className="nex-levels-more">
                          +{(c.categorical.distinct - 6).toLocaleString()} more
                        </li>
                      )}
                    </ul>
                  )}
                  {!c.numeric && !c.temporal && !c.categorical && (
                    <p className="nex-col-sample">{c.sample.slice(0, 3).join(" · ") || "—"}</p>
                  )}
                  <p className="nex-col-foot">
                    Reads as {KIND_PLAIN[c.kind]} · {c.distinct.toLocaleString()} different values
                    {c.coercionFailures > 0 && ` · ${c.coercionFailures} that don't fit`}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function QualityStrip({
  issues,
  onInspect,
}: {
  issues: QualityIssue[];
  onInspect: (issue: QualityIssue) => void;
}) {
  if (issues.length === 0) {
    return (
      <section className="nex-qual">
        <h2 className="nex-rail-title">Integrity</h2>
        <p className="nex-qual-clean">
          The file itself looks sound — no duplicate rows, no columns mixing
          text with numbers, no large gaps. Findings below rest on solid ground.
        </p>
      </section>
    );
  }

  return (
    <section className="nex-qual">
      <h2 className="nex-rail-title">Integrity</h2>
      <p className="nex-rail-sub">
        Problems with the file itself, found before any analysis ran. Each one
        changes what the numbers mean, so clear these first. Click to see the rows.
      </p>
      <ul className="nex-issues">
        {issues.map((q) => (
          <li key={q.id} className={`nex-issue nex-issue--${q.severity}`}>
            <button
              type="button"
              className="nex-issue-btn"
              onClick={() => onInspect(q)}
              disabled={q.rowRefs.length === 0}
            >
              <span className="nex-issue-dot" aria-hidden="true" />
              <span className="nex-issue-text">
                <strong>{q.title}</strong>
                <span>{q.detail}</span>
              </span>
              {q.rowRefs.length > 0 && <span className="nex-issue-go" aria-hidden="true">→</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
