import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { addWatch, listWatches, removeWatch } from "@/lib/nexus/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Subscribe a file to a recurring digest, or cancel one.
 *
 * The subscription is per file rather than per account, because a
 * client watching their job costs does not necessarily want the same
 * cadence on their invoice export.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const limit = rateLimit(`nexus-watch:${clientKey(req.headers)}`, 10);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many at once." }, { status: 429 });
  }

  let body: { email?: unknown; dataset?: unknown; cadence?: unknown; cancel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (body.cancel === true) {
    const ok = await removeWatch(typeof body.dataset === "string" ? body.dataset : "");
    return NextResponse.json({ ok });
  }

  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const dataset = typeof body.dataset === "string" ? body.dataset.trim().slice(0, 160) : "";
  const cadence = body.cadence === "weekly" ? "weekly" : "monthly";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  if (!dataset) {
    return NextResponse.json({ error: "Nothing to watch yet — analyse a file first." }, { status: 400 });
  }

  const ok = await addWatch({ email, dataset, cadence });
  if (!ok) {
    return NextResponse.json(
      { error: "Couldn't set that up just now. Try again in a moment." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, cadence });
}

export async function GET() {
  return NextResponse.json({ watches: await listWatches() });
}
