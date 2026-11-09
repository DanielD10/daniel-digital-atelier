import { plainMeaning } from "./plain";
import type { Analysis, Finding, QualityIssue } from "./types";

/**
 * The narration layer.
 *
 * The division of labour is the point: statistics decide WHAT is true,
 * the model only decides how to say it. Every number in the brief comes
 * from a finding the engine already computed and can already prove — the
 * model is handed those numbers and told, in the strongest terms the
 * prompt can manage, that it may not produce any others.
 *
 * That ordering is what makes an assertive dashboard safe. A model asked
 * to find the insight can invent one; a model asked to phrase a ranked
 * list of computed facts can only phrase them well or badly, and badly
 * is recoverable.
 *
 * With no API key configured the templated fallback runs instead, and
 * the panel is fully usable without it — narration is the one part of
 * this system that is genuinely optional.
 */

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 700;

export function narrationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Strip findings down to exactly what the model is allowed to talk about. */
function brief(analysis: Analysis) {
  return {
    rows: analysis.table.rows,
    columns: analysis.table.columns,
    findings: analysis.findings.slice(0, 8).map((f) => ({
      kind: f.kind,
      statement: f.headline,
      columns: f.columns,
      confidence: Number(f.confidence.toFixed(2)),
      sharePfRowsCovered: Number((f.coverage * 100).toFixed(1)),
      numbers: f.evidence,
    })),
    integrity: analysis.quality.slice(0, 5).map((q) => ({
      severity: q.severity,
      statement: q.title,
      rowsAffected: q.affected,
    })),
  };
}

const SYSTEM = `You write the opening brief for a data analysis panel.

You will be given a JSON object of findings that a statistical engine has already computed and verified. Your job is to turn them into three short paragraphs a busy person can read in twenty seconds.

Absolute rules:
- Use ONLY numbers that appear in the JSON. Never compute, estimate, round differently, or infer a new figure. If a number is not in the JSON, it does not go in the brief.
- Never assert causation. The engine measures association. Say "alongside", "while", "coincides with" — not "because", "drove", "caused".
- Never invent a business explanation for a pattern. You do not know what the company did. You may say a pattern is "consistent with" something only if the JSON's own note says so.
- If the integrity list is non-empty, the FIRST paragraph is about it, because data problems change what every other number means.
- Lead with what should change someone's decisions, not with what is easiest to describe.

Style: plain, direct, unhedged where the confidence is high and explicitly hedged where it is not. Short sentences. No bullet points, no headings, no preamble, no sign-off. Do not start with "This dataset" or "The data shows". Never use the words "delve", "leverage", "robust", "insights", or "key takeaway".

Three paragraphs maximum. Under 180 words total.`;

export async function narrate(analysis: Analysis): Promise<{ text: string; live: boolean }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: templated(analysis), live: false };
  if (analysis.findings.length === 0 && analysis.quality.length === 0) {
    return { text: templated(analysis), live: false };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(brief(analysis)) }],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      console.error("[nexus] narration rejected", res.status, (await res.text()).slice(0, 240));
      return { text: templated(analysis), live: false };
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();

    return text ? { text, live: true } : { text: templated(analysis), live: false };
  } catch (err) {
    console.error("[nexus] narration threw", err);
    return { text: templated(analysis), live: false };
  }
}

/**
 * The brief with no model involved.
 *
 * Not a degraded version of the model's output — a different route to
 * the same place. Every finding already carries a plain-English
 * explanation of itself, written from its own numbers, so a readable
 * brief is a matter of choosing which ones matter and putting them in
 * order. That makes the whole panel work, properly, with no API key,
 * no per-call cost, and nothing leaving the server.
 */
function templated(analysis: Analysis): string {
  const paras: string[] = [];
  const serious = analysis.quality.filter((q) => q.severity !== "low");

  if (serious.length > 0) {
    paras.push(
      `Start with the file itself: ${joinList(serious.slice(0, 3).map(lowerFirst))}. ` +
        `Each of those changes what the numbers below mean, so they are worth clearing before you act on anything else.`,
    );
  }

  const [first, ...rest] = analysis.findings;
  if (first) {
    const meaning = plainMeaning(first);
    paras.push(
      `The thing most worth your attention: ${lowerFirstStr(first.headline)}. ` +
        (meaning || ""),
    );
  }

  const next = rest.slice(0, 2);
  if (next.length > 0) {
    paras.push(
      `After that${next.length > 1 ? ", two things" : ""}: ` +
        `${next.map((f) => lowerFirstStr(f.headline)).join("; and ")}. ` +
        (rest.length > next.length
          ? `${rest.length - next.length} further ${
              rest.length - next.length === 1 ? "finding is" : "findings are"
            } below, each with the arithmetic and the rows behind it.`
          : `Both are set out below with the arithmetic and the rows behind them.`),
    );
  }

  if (paras.length === 0) {
    return (
      `${analysis.table.rows.toLocaleString()} rows across ${analysis.table.columns} columns, and nothing in them ` +
      `cleared the bar for a reportable pattern. That is itself worth knowing: the file is internally consistent ` +
      `and unremarkable, with no step changes, no segment behaving differently from the rest, and no data-quality ` +
      `problems large enough to distort an average.`
    );
  }
  return paras.join("\n\n");
}

function lowerFirstStr(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function lowerFirst(q: QualityIssue): string {
  return q.title.charAt(0).toLowerCase() + q.title.slice(1);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export type { Finding };
