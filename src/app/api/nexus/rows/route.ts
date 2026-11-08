import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { DEMO_ID, resolveDemo, resolveStored } from "@/lib/nexus/resolve";
import { peekSession } from "@/lib/nexus/store";
import { LIMITS } from "@/lib/nexus/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The audit endpoint: hand back the exact rows behind a claim.
 *
 * This is the half of the product that makes the other half allowed to
 * be assertive. A finding names row indices; this returns those rows
 * from the same bytes the finding was computed over, so a reader can
 * disagree with the engine using the engine's own evidence.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`nexus-rows:${clientKey(req.headers)}`, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let body: { id?: unknown; rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "No dataset id." }, { status: 400 });

  const wanted = Array.isArray(body.rows)
    ? body.rows
        .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0)
        .slice(0, LIMITS.auditRowCap)
    : [];
  if (wanted.length === 0) {
    return NextResponse.json({ error: "No rows requested." }, { status: 400 });
  }

  let resolved;
  if (id === DEMO_ID) {
    resolved = resolveDemo();
  } else {
    const session = await peekSession();
    if (!session) return NextResponse.json({ error: "No session." }, { status: 403 });
    resolved = await resolveStored(id, session, true);
  }
  if (!resolved) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { headers, rows } = resolved.table;
  const picked = wanted.filter((i) => i < rows.length).map((i) => rows[i]);

  return NextResponse.json({
    headers,
    rows: picked,
    total: wanted.length,
  });
}
