import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { narrate, narrationConfigured } from "@/lib/nexus/narrate";
import { DEMO_ID, resolveDemo, resolveStored } from "@/lib/nexus/resolve";
import { attachNarrative, getSession, spend } from "@/lib/nexus/store";

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

  /*
   * Metered, not gated.
   *
   * An earlier cut refused the brief outright until someone gave an
   * email, which removed the page's headline capability from anyone
   * unwilling to — a worse demo and a worse pitch. Everyone can run it
   * now; a free browser just gets fewer per day. When the allowance is
   * gone the response carries the pitch rather than a closed door.
   */
  const session = await getSession();
  const quota = await spend(session, "narrate");

  if (!quota.allowed) {
    const identified = quota.tier !== "anonymous";
    return NextResponse.json(
      {
        error: identified ? "quota" : "locked",
        reason: identified
          ? "You've used today's briefs. The allowance resets 24 hours after the first one."
          : "That's the free allowance of briefs for this browser. Writing one costs a model call, so tell me who you are and it goes up — along with Ask.",
      },
      { status: identified ? 429 : 402 },
    );
  }

  if (id === DEMO_ID) {
    if (demoBrief) return NextResponse.json({ ...demoBrief, cached: true });
    const result = await narrate(resolveDemo().analysis);
    demoBrief = result;
    return NextResponse.json({ ...result, cached: false });
  }

  const resolved = await resolveStored(id, session, false);
  if (!resolved) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const result = await narrate(resolved.analysis);
  if (result.live) void attachNarrative(id, session, result.text);

  return NextResponse.json({ ...result, cached: false, configured: narrationConfigured() });
}
