"use client";

import { useCallback, useRef, useState } from "react";
import FindingCard, { type AuditRows } from "./FindingCard";
import { ColumnRail, QualityStrip } from "./Panels";
import { Bars, Series } from "./Charts";
import { parseCsv } from "@/lib/nexus/csv";
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

interface AskState {
  question: string;
  statement: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  chart?: { labels: string[]; values: number[] };
}

export default function NexusConsole({ initial }: { initial: Loaded }) {
  const [data, setData] = useState<Loaded>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const [brief, setBrief] = useState<{ text: string; live: boolean } | null>(null);
  const [question, setQuestion] = useState("");
  const [ask, setAsk] = useState<AskState | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const ingest = useCallback(async (file: File) => {
    setError(null);
    setAsk(null);
    setAskError(null);
    setBrief(null);

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
      const text = await file.text();
      setBusy("Interrogating");
      const res = await fetch("/api/nexus/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text, name: file.name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That didn't parse.");
        return;
      }
      setData({
        id: json.id,
        name: json.name,
        analysis: json.analysis,
        stored: json.stored,
        csv: json.stored ? undefined : text,
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
      if (res.ok) setBrief({ text: json.text, live: json.live });
      else setError(json.error ?? "Couldn't write the brief.");
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
          setAskError(json.error ?? "Couldn't answer that.");
          return;
        }
        setAsk({
          question: q,
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
        const f = e.dataTransfer.files?.[0];
        if (f) void ingest(f);
      }}
    >
      <header className="nex-head">
        <div className="nex-head-id">
          <span className="nex-head-dot" aria-hidden="true" />
          <h2 className="nex-head-name">{data.name}</h2>
          {data.id === "demo" && <span className="nex-tag">sample</span>}
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
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="nex-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ingest(f);
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

      <section className="nex-brief">
        {brief ? (
          <>
            <div className="nex-brief-text">
              {brief.text.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <p className="nex-brief-foot">
              {brief.live
                ? "Written by Claude from the findings below. Every figure in it was computed before the model saw anything — it phrases the arithmetic, it doesn't do it."
                : "Assembled from the findings below. No model is configured on this deployment, so this is the engine's own wording."}
            </p>
          </>
        ) : (
          <button type="button" className="nex-btn nex-btn--wide" onClick={() => void requestBrief()} disabled={busy !== null}>
            Brief me on this
          </button>
        )}
      </section>

      <form className="nex-ask" onSubmit={submitAsk}>
        <label className="nex-ask-label" htmlFor="nex-q">Ask</label>
        <input
          id="nex-q"
          className="nex-ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Which region has the worst return rate?"
          autoComplete="off"
        />
        <button type="submit" className="nex-btn" disabled={busy !== null || !question.trim()}>
          Run
        </button>
      </form>

      {askError && <p className="nex-error" role="alert">{askError}</p>}

      {ask && (
        <section className="nex-result">
          <h3 className="nex-result-q">{ask.question}</h3>
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
            Computed by the engine from a validated query plan. The model wrote the plan, not the numbers.
          </p>
        </section>
      )}

      <div className="nex-body">
        <main className="nex-stack">
          <h2 className="nex-stack-title">
            Signal
            <span className="nex-stack-sub">
              Ranked by effect size against how much of the table each one covers.
            </span>
          </h2>
          {a.findings.length === 0 ? (
            <p className="nex-empty">
              Nothing cleared the reporting thresholds. For a table this size that usually means it is
              internally consistent and genuinely unremarkable — which is a result.
            </p>
          ) : (
            a.findings.map((f, i) => (
              <FindingCard key={f.id} finding={f} rank={i + 1} onAudit={auditFinding} />
            ))
          )}
        </main>

        <aside className="nex-aside">
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
