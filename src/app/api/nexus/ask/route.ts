import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { DEMO_ID, resolveDemo, resolveStored } from "@/lib/nexus/resolve";
import { peekSession } from "@/lib/nexus/store";
import { PlanError, runPlan, validatePlan, type Plan } from "@/lib/nexus/query";
import { profileTable } from "@/lib/nexus/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Natural-language questions, answered by the engine.
 *
 * The model's only job is translation: schema and question in, a query
 * plan out. It never sees a single row of data and never produces a
 * number. The plan is validated against the real columns and executed
 * by the same arithmetic the findings use, so the answer is auditable
 * and reproducible — ask twice, get the same figures.
 */

const PLANNER_SYSTEM = `You translate a question about a table into a query plan. You never answer the question yourself and you never see the data.

Reply with ONE JSON object and nothing else. No prose, no markdown fence.

Shapes:
{"op":"aggregate","metric":COL,"stat":"mean"|"median"|"sum"|"count"|"min"|"max"|"p90","groupBy":COL?,"filter":[F],"limit":N?}
{"op":"rate","flag":BOOLEAN_COL,"groupBy":COL?,"filter":[F]}
{"op":"series","dateColumn":DATE_COL,"metric":COL?,"stat":"median"|"count"|"sum","filter":[F]}
{"op":"compare","metric":COL,"groupBy":COL,"stat":STAT?,"filter":[F]}
{"op":"describe","column":COL}

F is {"column":COL,"op":"eq"|"neq"|"gt"|"lt"|"gte"|"lte"|"contains","value":STRING_OR_NUMBER}

Rules:
- COL must be copied EXACTLY from the schema you are given. Never invent one.
- Prefer "median" over "mean" for money and durations; outliers move a mean.
- "rate" is only for boolean columns. "how many X are Y" over a boolean is a rate.
- "over time", "by month", "trend" → series.
- A question naming no column that exists → {"op":"error","why":"<one short sentence>"}.`;

interface AskBody {
  id?: unknown;
  question?: unknown;
}

export async function POST(req: Request) {
  const limit = rateLimit(`nexus-ask:${clientKey(req.headers)}`, 8);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many questions at once. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Ask needs a model to turn your question into a query plan, and no API key is configured on this deployment. Everything else on this panel is computed locally and works without it.",
      },
      { status: 503 },
    );
  }

  let body: AskBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 400) : "";
  if (!id || !question) {
    return NextResponse.json({ error: "Need a dataset and a question." }, { status: 400 });
  }

  let resolved;
  if (id === DEMO_ID) {
    resolved = resolveDemo();
  } else {
    const session = await peekSession();
    if (!session) return NextResponse.json({ error: "No session." }, { status: 403 });
    resolved = await resolveStored(id, session, true);
  }
  if (!resolved || resolved.table.headers.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Re-profile to recover the typed date map the executor needs.
  const profile = profileTable(resolved.table);

  const schema = profile.columns.map((c) => ({
    name: c.name,
    type: c.kind,
    ...(c.categorical ? { levels: c.categorical.top.slice(0, 8).map((t) => t.value) } : {}),
  }));

  let plan: Plan;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5-5",
        max_tokens: 400,
        system: PLANNER_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Schema:\n${JSON.stringify(schema)}\n\nQuestion: ${question}`,
          },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      console.error("[nexus] planner rejected", res.status);
      return NextResponse.json({ error: "The planner is unavailable right now." }, { status: 502 });
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();

    // Tolerate a fenced block, but nothing looser — anything else is a miss.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    if (parsed.op === "error") {
      return NextResponse.json(
        { error: typeof parsed.why === "string" ? parsed.why : "That one isn't answerable here." },
        { status: 422 },
      );
    }
    plan = validatePlan(parsed);
  } catch (err) {
    if (err instanceof PlanError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[nexus] planner threw", err);
    return NextResponse.json({ error: "Couldn't turn that into a query." }, { status: 502 });
  }

  try {
    const result = runPlan(plan, resolved.table, profile.columns, profile.dateValues);
    return NextResponse.json({ plan, result });
  } catch (err) {
    if (err instanceof PlanError) {
      return NextResponse.json({ error: err.message, plan }, { status: 422 });
    }
    console.error("[nexus] execution threw", err);
    return NextResponse.json({ error: "That query failed to run." }, { status: 500 });
  }
}
