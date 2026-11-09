"use client";

import type { RunDiff } from "@/lib/nexus/diff";

/**
 * What changed since the last time this file was looked at.
 *
 * Sits above everything else because it is the only part of the panel
 * that cannot be got anywhere else. The findings describe the file;
 * this describes the business moving, which is the thing somebody
 * actually opens it every month to see.
 */
export default function SinceLast({ diff }: { diff: RunDiff }) {
  const when = new Date(diff.previousAt);
  const days = Math.max(1, Math.round((Date.now() - when.getTime()) / 86400000));
  const headline = diff.changes.filter((c) => c.kind === "new" || c.kind === "worse").slice(0, 3);
  const gone = diff.changes.filter((c) => c.kind === "resolved").slice(0, 2);

  const rowDelta = diff.currentRows - diff.previousRows;

  return (
    <section className="nex-since">
      <h2 className="nex-rail-title">Since last time</h2>
      <p className="nex-since-lead">{diff.summary}</p>
      <p className="nex-since-meta">
        Compared against your upload of {days} day{days === 1 ? "" : "s"} ago
        {rowDelta !== 0 && (
          <>
            {" · "}
            {rowDelta > 0 ? "+" : ""}
            {rowDelta.toLocaleString()} rows
          </>
        )}
      </p>

      {diff.newIssues.length > 0 && (
        <p className="nex-since-issue">
          New in the file itself: {diff.newIssues.slice(0, 2).join("; ")}.
        </p>
      )}

      {headline.length > 0 && (
        <ul className="nex-since-list">
          {headline.map((c) => (
            <li key={c.id} className={`nex-since-item is-${c.kind}`}>
              <span className="nex-since-tag">{c.kind === "new" ? "New" : "Worse"}</span>
              <span>{c.headline}</span>
            </li>
          ))}
        </ul>
      )}

      {gone.length > 0 && (
        <ul className="nex-since-list">
          {gone.map((c) => (
            <li key={c.id} className="nex-since-item is-resolved">
              <span className="nex-since-tag">Gone</span>
              <span>{c.headline}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
