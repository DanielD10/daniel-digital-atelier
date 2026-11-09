"use client";

import { useCallback, useRef, useState } from "react";
import FindingCard, { type AuditRows } from "./FindingCard";
import { ColumnRail, QualityStrip } from "./Panels";
import { Bars, Series } from "./Charts";
import SinceLast from "./SinceLast";
import { Beyond, UnlockPanel } from "./Unlock";
import type { FindingChange, RunDiff } from "@/lib/nexus/diff";
import { parseCsv } from "@/lib/nexus/csv";
import type { Tier } from "@/lib/nexus/entitlements";
import { DUE_DILIGENCE } from "@/lib/nexus/plain";
import { LIMITS, type Analysis, type Finding, type QualityIssue } from "@/lib/nexus/types";

/**
 * The panel.
 *
 * Server-rendered with the demo already analysed, so the first paint is
 * a working instrument rather than a spinner over an empty grid. Nothing
 * here computes anything: every number on screen came out of the engine
 * and can be traced back to rows through the audit endpoint.
 */

interface Loaded {
  id: string;
  name: string;
  analysis: Analysis;
  stored: boolean;
  /** Held only when the write to storage failed, so auditing still works locally. */
  csv?: string;
}

interface Ceiling {
  note: string;
}

interface AskState {
  question: string;
  reading: string | null;
  statement: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  chart?: { labels: string[]; values: number[] };
}

export default function NexusConsole({
  initial,
  tier: initialTier,
}: {
  initial: Loaded;
  tier: Tier;
}) {
  const [data, setData] = useState<Loaded>(initial);
  const [tier, setTier] = useState<Tier>(initialTier);
  const [lock, setLock] = useState<string | null>(null);
  const [ceiling, setCeiling] = useState<Ceiling | null>(null);
  const [sheet, setSheet] = useState<{ used: string; all: string[] } | null>(null);
  const [diff, setDiff] = useState<RunDiff | null>(null);
  const [join, setJoin] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const [brief, setBrief] = useState<{ text: string; live: boolean } | null>(null);
  const [question, setQuestion] = useState("");
  const [ask, setAsk] = useState<AskState | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [askHints, setAskHints] = useState<string[]>([]);

  const fileInput = useRef<HTMLInputElement>(null);

  const ingest = useCallback(async (files: File[]) => {
    const file = files[0];
    const partner = files[1] ?? null;
    setError(null);
    setAsk(null);
    setAskError(null);
    setBrief(null);
    setCeiling(null);
    setSheet(null);
    setDiff(null);
    setJoin(null);

    /*
     * The file picker's accept list does nothing for drag-and-drop, so
     * the common mistake — dragging the .xlsx straight out of the
     * folder — has to be caught here. Reading one as text produces
     * mojibake that parses into a single enormous column, and the panel
     * would answer "nothing found", which is true and unhelpful.
     */
    if (/\.(xls|numbers|ods|pdf|docx?|pptx?|png|jpe?g|gif|webp|parquet)$/i.test(file.name)) {
      const ext = file.name.split(".").pop()!.toUpperCase();
      setError(
        /^(xls|numbers|ods)$/i.test(ext)
          ? `${ext} is an older or non-Excel spreadsheet format. Save it as .xlsx or .csv and drop that — both work here.`
          : `${ext} isn't a table. NEXUS reads .xlsx, .csv and .tsv.`,
      );
      return;
    }

    const isWorkbook = /\.xlsx$/i.test(file.name);
    if (partner && isWorkbook) {
      setError(
        "Joining two files works with CSV and TSV for now. Save the workbook as CSV and drop both again.",
      );
      return;
    }

    if (file.size > LIMITS.maxBytes) {
      setError(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. The ceiling here is ${
          LIMITS.maxBytes / 1024 / 1024
        }MB — this runs on a hobby tier, not a warehouse.`,
      );
      return;
    }

    setBusy("Reading");
    try {
      // A workbook goes over as bytes; the server unzips it and pulls
      // out the sheet that actually holds a table.
      const text = isWorkbook ? "" : await file.text();
      setBusy(isWorkbook ? "Opening the workbook" : "Interrogating");
      if (partner) setBusy("Matching the two files");
      const res = isWorkbook
        ? await fetch("/api/nexus/analyze", {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "x-nexus-filename": encodeURIComponent(file.name),
            },
            body: await file.arrayBuffer(),
          })
        : await fetch("/api/nexus/analyze", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              csv: text,
              name: file.name,
              ...(partner ? { second: await partner.text(), secondName: partner.name } : {}),
            }),
          });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That didn't parse.");
        if (json.beyond) setCeiling({ note: "" });
        return;
      }
      if (json.atCeiling) setCeiling({ note: json.ceilingNote ?? "" });
      setSheet(json.sheet ? { used: json.sheet, all: json.sheets ?? [] } : null);
      setDiff(json.diff ?? null);
      setJoin(json.join ?? null);
      setData({
        id: json.id,
        name: json.name,
        analysis: json.analysis,
        stored: json.stored,
        // A workbook's rows live only on the server, so local audit
        // fallback applies to delimited text alone.
        csv: json.stored || isWorkbook ? undefined : text,
      });
    } catch {
      setError("Couldn't read that file.");
    } finally {
      setBusy(null);
    }
  }, []);

  const loadDemo = useCallback(async () => {
    setBusy("Loading");
    setError(null);
    setAsk(null);
    setBrief(null);
    try {
      const res = await fetch("/api/nexus/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demo: true }),
      });
      const json = await res.json();
      if (res.ok) {
        setData({ id: json.id, name: json.name, analysis: json.analysis, stored: false });
      }
    } finally {
      setBusy(null);
    }
  }, []);

  /**
   * Fetch the rows behind a claim. If storage was unavailable the file
   * never left the browser, so the same slice happens here instead —
   * the audit trail should not depend on the database being up.
   */
  const audit = useCallback(
    async (rowRefs: number[], columns: string[]): Promise<AuditRows> => {
      void columns;
      if (data.csv) {
        const parsed = parseCsv(data.csv);
        return {
          headers: parsed.headers,
          rows: rowRefs.filter((i) => i < parsed.rows.length).slice(0, 60).map((i) => parsed.rows[i]),
          total: rowRefs.length,
        };
      }
      const res = await fetch("/api/nexus/rows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: data.id, rows: rowRefs.slice(0, 60) }),
      });
      if (!res.ok) throw new Error("audit failed");
      return (await res.json()) as AuditRows;
    },
    [data],
  );

  const auditFinding = useCallback(
    (f: Finding) => audit(f.rowRefs, f.columns),
    [audit],
  );

  const [issueRows, setIssueRows] = useState<{ issue: QualityIssue; rows: AuditRows } | null>(null);
  const inspectIssue = useCallback(
    async (issue: QualityIssue) => {
      try {
        const rows = await audit(issue.rowRefs, issue.column ? [issue.column] : []);
        setIssueRows({ issue, rows });
      } catch {
        /* Inspecting is a convenience; a failure here is not worth an alert. */
      }
    },
    [audit],
  );

  const requestBrief = useCallback(async () => {
    setBusy("Writing");
    try {
      const res = await fetch("/api/nexus/narrate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: data.id }),
      });
      const json = await res.json();
      if (res.ok) {
        setBrief({ text: json.text, live: json.live });
      } else if (json.error === "locked") {
        setLock(json.reason);
      } else if (json.error === "quota") {
        setError(json.reason);
      } else {
        setError(json.error ?? "Couldn't write the brief.");
      }
    } catch {
      setError("Couldn't reach the brief service.");
    } finally {
      setBusy(null);
    }
  }, [data.id]);

  const submitAsk = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = question.trim();
      if (!q) return;
      setBusy("Planning");
      setAskError(null);
      setAsk(null);
      try {
        const res = await fetch("/api/nexus/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: data.id, question: q }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json.error === "locked") setLock(json.reason);
          else {
            setAskError(json.error === "quota" ? json.reason : json.error ?? "Couldn't answer that.");
            setAskHints(Array.isArray(json.examples) ? json.examples : []);
          }
          return;
        }
        setAskHints([]);
        setAsk({
          question: q,
          reading: json.reading ?? null,
          statement: json.result.statement,
          columns: json.result.columns,
          rows: json.result.rows,
          chart: json.result.chart,
        });
      } catch {
        setAskError("Couldn't reach the planner.");
      } finally {
        setBusy(null);
      }
    },
    [data.id, question],
  );

  const a = data.analysis;
  const changeFor = new Map<string, FindingChange>(
    (diff?.changes ?? []).map((c) => [c.id, c]),
  );

  return (
    <div
      className={drag ? "nex-console is-drag" : "nex-console"}
      onDragOver={(e) => {
        e.preventDefault();
        if (!drag) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const fs = Array.from(e.dataTransfer.files ?? []).slice(0, 2);
        if (fs.length) void ingest(fs);
      }}
    >
      <header className="nex-head">
        <div className="nex-head-id">
          <span className="nex-head-dot" aria-hidden="true" />
          <h2 className="nex-head-name">{data.name}</h2>
          {data.id === "demo" && <span className="nex-tag">sample</span>}
          {tier !== "anonymous" && <span className="nex-tag">{tier}</span>}
          {sheet && (
            <span className="nex-tag" title={sheet.all.join(" · ")}>
              sheet: {sheet.used}
              {sheet.all.length > 1 ? ` of ${sheet.all.length}` : ""}
            </span>
          )}
          {!data.stored && data.id !== "demo" && <span className="nex-tag nex-tag--warn">not saved</span>}
        </div>

        <dl className="nex-head-stats">
          <div><dt>rows</dt><dd>{a.table.rows.toLocaleString()}</dd></div>
          <div><dt>columns</dt><dd>{a.table.columns}</dd></div>
          <div><dt>findings</dt><dd>{a.findings.length}</dd></div>
          {a.elapsedMs > 0 && <div><dt>scan</dt><dd>{a.elapsedMs}ms</dd></div>}
        </dl>

        <div className="nex-head-acts">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="nex-file"
            multiple
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []).slice(0, 2);
              if (fs.length) void ingest(fs);
              e.target.value = "";
            }}
          />
          <button type="button" className="nex-btn" onClick={() => fileInput.current?.click()}>
            Drop your own data
          </button>
          {data.id !== "demo" && (
            <button type="button" className="nex-btn nex-btn--ghost" onClick={() => void loadDemo()}>
              Back to sample
            </button>
          )}
        </div>
      </header>

      {busy && (
        <p className="nex-busy" role="status">
          <span className="nex-busy-bar" aria-hidden="true" />
          {busy}…
        </p>
      )}
      {error && <p className="nex-error" role="alert">{error}</p>}

      {join && (
        <p className="nex-join" role="status">
          <span className="nex-join-tag">Joined</span>
          {join}
        </p>
      )}

      {diff && <SinceLast diff={diff} />}

      {ceiling && <Beyond note={ceiling.note} />}

      <section className="nex-brief">
        {lock ? (
          <UnlockPanel
            reason={
              lock ??
              "The brief and Ask are written by a model, which costs real money per call. Tell me who you are and both unlock for this browser."
            }
            datasetName={data.name}
            onUnlocked={() => {
              setTier("identified");
              setLock(null);
            }}
          />
        ) : brief ? (
          <>
            <div className="nex-brief-text">
              {brief.text.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <p className="nex-brief-foot">
              {brief.live
                ? "Written by Claude from the findings below. Every figure was computed before the model saw anything — it phrases the arithmetic, it doesn't do it."
                : "Written from the findings below, on this server. Every figure was computed from your file; nothing was sent anywhere."}
            </p>
          </>
        ) : (
          <>
            <p className="nex-brief-invite">
              Want this in a few sentences instead? The brief reads the findings
              below and tells you what matters, in order.
            </p>
            <button
              type="button"
              className="nex-btn nex-btn--wide"
              onClick={() => void requestBrief()}
              disabled={busy !== null}
            >
              Summarise this for me
            </button>
          </>
        )}
      </section>

      <form className="nex-ask" onSubmit={submitAsk}>
        <label className="nex-ask-label" htmlFor="nex-q">Ask</label>
        <input
          id="nex-q"
          className="nex-ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask in plain English — try: which region has the worst return rate?"
          autoComplete="off"
        />
        <button type="submit" className="nex-btn" disabled={busy !== null || !question.trim()}>
          Run
        </button>
      </form>

      {askError && (
        <div className="nex-error" role="alert">
          <p>{askError}</p>
          {askHints.length > 0 && (
            <ul className="nex-hints">
              {askHints.map((h) => (
                <li key={h}>
                  <button type="button" onClick={() => setQuestion(h)}>{h}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ask && (
        <section className="nex-result">
          <h3 className="nex-result-q">{ask.question}</h3>
          {ask.reading && <p className="nex-result-read">Read as: {ask.reading}</p>}
          <p className="nex-result-stmt">{ask.statement}</p>
          {ask.chart && ask.chart.values.length > 1 && (
            <div className="nex-result-chart">
              {ask.chart.labels.length > 14 ? (
                <Series values={ask.chart.values} labels={ask.chart.labels} tone="cool" />
              ) : (
                <Bars items={ask.chart.labels.map((l, i) => ({ label: l, value: ask.chart!.values[i] }))} />
              )}
            </div>
          )}
          <div className="nex-rows">
            <table>
              <thead>
                <tr>{ask.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {ask.rows.slice(0, 30).map((r, i) => (
                  <tr key={i}>{r.map((cell, j) => <td key={j}>{String(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nex-result-foot">
            Worked out on this server from your file. If that isn&apos;t the question you meant, rephrase it
            using a column name and it will read it again.
          </p>
        </section>
      )}

      <div className="nex-body">
        <main className="nex-stack">
          <h2 className="nex-stack-title">
            What stands out
            <span className="nex-stack-sub">
              Most important first. Each card says what it found, what it means,
              and lets you open the exact rows it came from.
            </span>
          </h2>

          <details className="nex-howto">
            <summary>New to this? How to read a card</summary>
            <ol>
              <li>
                <strong>The headline</strong> is what was found, in one line. The
                paragraph under it says what that means for you in plain terms.
              </li>
              <li>
                <strong>The picture</strong> has a note under it telling you how to
                read it. You never have to work that out yourself.
              </li>
              <li>
                <strong>Strong, Clear or Tentative</strong> in the corner is how sure
                the maths is. Tentative means treat it as a hint, not a fact.
              </li>
              <li>
                <strong>Show the work</strong> opens the arithmetic and the actual
                rows behind the claim, so you can check it rather than trust it.
              </li>
            </ol>
          </details>
          {a.findings.length === 0 ? (
            <p className="nex-empty">
              Nothing cleared the reporting thresholds. For a table this size that usually means it is
              internally consistent and genuinely unremarkable — which is a result.
            </p>
          ) : (
            a.findings.map((f, i) => (
              <FindingCard
                key={f.id}
                finding={f}
                rank={i + 1}
                onAudit={auditFinding}
                change={changeFor.get(f.id)}
              />
            ))
          )}
        </main>

        <aside className="nex-aside">
          <section className="nex-care">
            <h2 className="nex-rail-title">{DUE_DILIGENCE.heading}</h2>
            <p>{DUE_DILIGENCE.body}</p>
          </section>
          <QualityStrip issues={a.quality} onInspect={(q) => void inspectIssue(q)} />
          {issueRows && (
            <div className="nex-issue-rows">
              <div className="nex-issue-rows-top">
                <strong>{issueRows.issue.title}</strong>
                <button type="button" className="nex-x" onClick={() => setIssueRows(null)} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="nex-rows">
                <table>
                  <thead>
                    <tr>{issueRows.rows.headers.map((h) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {issueRows.rows.rows.slice(0, 12).map((r, i) => (
                      <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <ColumnRail columns={a.columns} />
        </aside>
      </div>
    </div>
  );
}
