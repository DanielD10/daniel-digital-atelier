import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * /api/luxe/ai — the AI behind the LUXE demo at /luxe.
 *
 * Inside the Claude app, LUXE talks to Claude on the viewer's own
 * account and never calls this route. On this site there's no Claude
 * viewer, so public/luxe/index.html sends its prompts here instead.
 *
 * Off by default. It turns on when both are set in Vercel:
 *   LUXE_AI_PROVIDER = "gemini" | "anthropic"
 *   GEMINI_API_KEY or ANTHROPIC_API_KEY
 * LUXE_AI_MODEL overrides the model ID. While it's off, GET answers
 * { enabled: false } and the demo hides its AI controls with a note,
 * so a missing key never shows a visitor an error.
 *
 * Plain fetch to each provider's REST API, no SDK, same as the
 * contact route. Errors come back as { code, error } using the code
 * names the page already handles (rate_limited, refused, ...).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Role = "user" | "assistant";
type Turn = { role: Role; content: string };
type Provider = "anthropic" | "gemini";
type Image = { mediaType: string; data: string };
type Result = { text: string; truncated: boolean };

class AiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** A chat is several calls, so this is looser than the contact form's 5. */
const PER_MINUTE = 20;
const MAX_BODY_BYTES = 3_500_000;
const MAX_TEXT_CHARS = 60_000;
const MAX_OUTPUT_TOKENS = 2048;
const TIMEOUT_MS = 55_000;

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-haiku-5-5",
  gemini: "gemini-flash-latest",
};

function activeProvider(): Provider | null {
  const p = (process.env.LUXE_AI_PROVIDER ?? "").trim().toLowerCase();
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (p === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export async function GET() {
  return NextResponse.json(
    { enabled: activeProvider() !== null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function fail(code: string, error: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ code, error }, { status, headers });
}

/** Accepts a prompt string or user/assistant turns; merges repeats; must end on the user. */
function toTurns(input: unknown): Turn[] | null {
  let raw: Turn[] = [];
  if (typeof input === "string") raw = [{ role: "user", content: input }];
  else if (Array.isArray(input)) {
    raw = input
      .filter(
        (t): t is Turn =>
          !!t &&
          typeof t === "object" &&
          ((t as Turn).role === "user" || (t as Turn).role === "assistant") &&
          typeof (t as Turn).content === "string" &&
          (t as Turn).content.trim() !== "",
      )
      .map((t) => ({ role: t.role, content: t.content }));
  }
  const turns: Turn[] = [];
  for (const t of raw) {
    const last = turns[turns.length - 1];
    if (last && last.role === t.role) last.content += "\n\n" + t.content;
    else turns.push({ ...t });
  }
  if (!turns.length || turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

function toImage(value: unknown): Image | null | "bad" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "bad";
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  return m ? { mediaType: m[1], data: m[2] } : "bad";
}

/** Same tolerance as the page expects: whole reply, a fenced block, or first bracket to last. */
function parseJson(text: string): unknown {
  const tries = [text.trim()];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) tries.push(fence[1].trim());
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) tries.push(text.slice(start, end + 1));
  for (const t of tries) {
    try {
      return JSON.parse(t);
    } catch {
      /* try the next shape */
    }
  }
  throw new AiError("invalid_json", "The reply wasn't valid JSON.", 502);
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AiError("upstream_error", "Couldn't reach the AI provider.");
  }
  if (res.status === 429) throw new AiError("rate_limited", "The AI provider is busy. Try again in a minute.", 429);
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    console.error("[luxe-ai] provider error", res.status, detail);
    throw new AiError("upstream_error", "The AI provider returned an error.");
  }
  return res.json();
}

async function callAnthropic(turns: Turn[], image: Image | null): Promise<Result> {
  const model = process.env.LUXE_AI_MODEL || DEFAULT_MODEL.anthropic;
  const last = turns.length - 1;
  const data = (await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: turns.map((t, i) => ({
        role: t.role,
        content:
          i === last && image
            ? [
                { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
                { type: "text", text: t.content },
              ]
            : t.content,
      })),
    },
  )) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  if (data.stop_reason === "refusal") throw new AiError("refused", "The model declined this one.", 422);
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return { text, truncated: data.stop_reason === "max_tokens" };
}

async function callGemini(turns: Turn[], image: Image | null, json: boolean): Promise<Result> {
  const model = process.env.LUXE_AI_MODEL || DEFAULT_MODEL.gemini;
  const last = turns.length - 1;
  const data = (await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": process.env.GEMINI_API_KEY! },
    {
      contents: turns.map((t, i) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [
          ...(i === last && image ? [{ inline_data: { mime_type: image.mediaType, data: image.data } }] : []),
          { text: t.content },
        ],
      })),
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS * 2,
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
    },
  )) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const cand = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || cand?.finishReason === "SAFETY") {
    throw new AiError("refused", "The model declined this one.", 422);
  }
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return { text, truncated: cand?.finishReason === "MAX_TOKENS" };
}

export async function POST(request: Request) {
  const provider = activeProvider();
  if (!provider) return fail("sampling_disabled", "AI is switched off on this site.", 503);

  const limit = rateLimit(`luxe-ai:${clientKey(request.headers)}`, PER_MINUTE);
  if (!limit.allowed) {
    return fail("rate_limited", "That's a lot of questions at once. Try again shortly.", 429, {
      "Retry-After": String(limit.retryAfter),
    });
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return fail("prompt_too_large", "That request is too large.", 413);

  let body: { input?: unknown; json?: unknown; image?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("invalid_request", "Expected a JSON body.", 400);
  }

  const turns = toTurns(body.input);
  if (!turns) return fail("invalid_request", "Send a prompt, or turns that end on the user.", 400);
  if (turns.reduce((n, t) => n + t.content.length, 0) > MAX_TEXT_CHARS) {
    return fail("prompt_too_large", "That's too much text.", 413);
  }
  const image = toImage(body.image);
  if (image === "bad") return fail("image_rejected", "Send a JPEG, PNG or WebP image.", 400);

  const json = body.json === true;
  if (json) turns[turns.length - 1].content += "\n\nReply with only one JSON value and no other text.";

  try {
    const out = provider === "anthropic" ? await callAnthropic(turns, image) : await callGemini(turns, image, json);
    if (!out.text.trim()) return fail("empty_completion", "No answer came back.", 502);
    if (json) {
      if (out.truncated) return fail("invalid_json", "The answer was cut short.", 502);
      return NextResponse.json({ json: parseJson(out.text) });
    }
    return NextResponse.json({ text: out.text, truncated: out.truncated });
  } catch (e) {
    if (e instanceof AiError) return fail(e.code, e.message, e.status);
    console.error("[luxe-ai] unexpected", e);
    return fail("upstream_error", "Something went wrong.", 502);
  }
}
