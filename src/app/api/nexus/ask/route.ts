import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { DEMO_ID, resolveDemo, resolveStored } from "@/lib/nexus/resolve";
import { getSession, spend } from "@/lib/nexus/store";
import { PlanError, runPlan, validatePlan, type Plan } from "@/lib/nexus/query";
import { interpret } from "@/lib/nexus/interpret";
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
{"op":"drivers","metric":COL,"groupBy":COL,"dateColumn":DATE_COL?,"a":{...}?,"b":{...}?,"filter":[F]}
{"op":"periods","dateColumn":DATE_COL,"metric":COL?,"stat":STAT?,"groupBy":COL?,"a":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},"b":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},"filter":[F]}

F is {"column":COL,"op":"eq"|"neq"|"gt"|"lt"|"gte"|"lte"|"contains","value":STRING_OR_NUMBER}

Rules:
- COL must be copied EXACTLY from the schema you are given. Never invent one.
- Prefer "median" over "mean" for money and durations; outliers move a mean.
- "rate" is only for boolean columns. "how many X are Y" over a boolean is a rate.
- "over time", "by month", "trend" → series.
- "why did X change/drop/rise", "what's driving X", "what explains X" → drivers. Pick the segment column most likely to explain it; if unsure, the lowest-cardinality category.
- "this month vs last", "Q1 vs Q2", "before and after X", "year over year" → periods. "a" is the EARLIER window, "b" the later one.
- Resolve relative dates ("last 30 days", "this quarter", "since June") against TODAY, given below, and emit absolute YYYY-MM-DD. Never emit a relative phrase.
- Filters on a date column use gt/gte/lt/lte with a YYYY-MM-DD value.
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

  const session = await getSession();

  let resolved;
  if (id === DEMO_ID) {
    resolved = resolveDemo();
  } else {
    resolved = await resolveStored(id, session, true);
  }
  if (!resolved || resolved.table.headers.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Re-profile to recover the typed date map the executor needs.
  const profile = profileTable(resolved.table);

  /*
   * Date columns carry their span. Without it the planner resolves
   * "last quarter" against today and silently returns an empty window
   * for a file whose data stopped in March.
   */
  const schema = profile.columns.map((c) => ({
    name: c.name,
    type: c.kind,
    ...(c.categorical ? { levels: c.categorical.top.slice(0, 8).map((t) => t.value) } : {}),
    ...(c.temporal ? { from: c.temporal.min, to: c.temporal.max } : {}),
  }));

  /*
   * Read the question here first, with no model and no network call.
   *
   * The planner used to be a model call for every question: money per
   * ask, and the client's column names leaving the building. The
   * second is what matters commercially — "does our data go to a third
   * party" decides deals in regulated industries, and the honest
   * answer should be "no". The local reader handles the grammars
   * people actually use; a model, if one is configured, picks up only
   * what it cannot read.
   */
  let plan: Plan;
  let reading: string | null = null;
  let readBy: "local" | "model" = "local";

  const local = interpret(question, profile.columns);
  if (!("error" in local)) {
    plan = local.plan;
    reading = local.reading;
  } else {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: local.error, examples: local.examples },
        { status: 422 },
      );
    }
    readBy = "model";

    /*
     * Metered only here. The local reader handles most questions for
     * nothing, so charging a visitor's allowance for those would be
     * billing them for work that cost nobody anything.
     */
    const quota = await spend(session, "ask");
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error:
            quota.tier === "anonymous"
              ? "I couldn't read that one directly, and the free allowance for the smarter reader is used up for today. Try rephrasing it with a column name in it."
              : "I couldn't read that one directly, and today's allowance for the smarter reader is used up.",
          examples: local.examples,
        },
        { status: 422 },
      );
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
          model: "claude-sonnet-5-5",
          max_tokens: 400,
          system: PLANNER_SYSTEM,
          messages: [
            {
              role: "user",
              content:
                `Today: ${new Date().toISOString().slice(0, 10)}\n` +
                `Schema:\n${JSON.stringify(schema)}\n\n` +
                `Question: ${question}`,
            },
          ],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: local.error, examples: local.examples },
          { status: 422 },
        );
      }

      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = (json.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      if (parsed.op === "error") {
        return NextResponse.json(
          {
            error: typeof parsed.why === "string" ? parsed.why : local.error,
            examples: local.examples,
          },
          { status: 422 },
        );
      }
      plan = validatePlan(parsed);
    } catch (err) {
      if (err instanceof PlanError) {
        return NextResponse.json({ error: err.message, examples: local.examples }, { status: 422 });
      }
      console.error("[nexus] planner threw", err);
      return NextResponse.json(
        { error: local.error, examples: local.examples },
        { status: 422 },
      );
    }
  }

  try {
    const result = runPlan(plan, resolved.table, profile.columns, profile.dateValues);
    return NextResponse.json({ plan, result, reading, readBy });
  } catch (err) {
    if (err instanceof PlanError) {
      return NextResponse.json({ error: err.message, plan }, { status: 422 });
    }
    console.error("[nexus] execution threw", err);
    return NextResponse.json({ error: "That query failed to run." }, { status: 500 });
  }
}
