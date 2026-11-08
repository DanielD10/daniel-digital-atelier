import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { narrate, narrationConfigured } from "@/lib/nexus/narrate";
import { DEMO_ID, resolveDemo, resolveStored } from "@/lib/nexus/resolve";
import { attachNarrative, peekSession } from "@/lib/nexus/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Write the brief.
 *
 * Deliberately not automatic. This is the one route that spends money
 * per call, and a portfolio page that quietly bills its owner for every
 * passing visitor is a bad design regardless of how good the prose is.
 * The panel is complete without it; the reader asks for it.
 *
 * The demo's brief is cached in process, so the common case — several
 * people clicking it on the same warm instance — costs one call.
 */
let demoBrief: { text: string; live: boolean } | null = null;

export async function POST(req: Request) {
  const limit = rateLimit(`nexus-narrate:${clientKey(req.headers)}`, 4);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "The brief is rate limited. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "No dataset id." }, { status: 400 });

  if (id === DEMO_ID) {
    if (demoBrief) return NextResponse.json({ ...demoBrief, cached: true });
    const result = await narrate(resolveDemo().analysis);
    demoBrief = result;
    return NextResponse.json({ ...result, cached: false });
  }

  const session = await peekSession();
  if (!session) return NextResponse.json({ error: "No session." }, { status: 403 });

  const resolved = await resolveStored(id, session, false);
  if (!resolved) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const result = await narrate(resolved.analysis);
  if (result.live) void attachNarrative(id, session, result.text);

  return NextResponse.json({ ...result, cached: false, configured: narrationConfigured() });
}
