import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { analyzeCsv, DataTooLargeError } from "@/lib/nexus/analyze";
import { resolveDemo } from "@/lib/nexus/resolve";
import { getSession, saveDataset, storeConfigured } from "@/lib/nexus/store";
import { LIMITS } from "@/lib/nexus/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parse, profile and interrogate a table.
 *
 * The demo path touches no storage and needs no session, so the panel
 * on the page works whether or not the database is reachable. Uploads
 * are analysed first and stored second: if the write fails the caller
 * still gets their findings, they just do not persist between visits.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`nexus-analyze:${clientKey(req.headers)}`, 12);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads in a row. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { csv?: unknown; name?: unknown; demo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  if (body.demo === true) {
    const demo = resolveDemo();
    return NextResponse.json({
      id: demo.id,
      name: demo.name,
      analysis: demo.analysis,
      stored: false,
    });
  }

  if (typeof body.csv !== "string" || body.csv.trim() === "") {
    return NextResponse.json({ error: "No CSV in the request." }, { status: 400 });
  }
  if (body.csv.length > LIMITS.maxBytes) {
    return NextResponse.json(
      {
        error: `That file is ${(body.csv.length / 1024 / 1024).toFixed(1)}MB. The ceiling here is ${
          LIMITS.maxBytes / 1024 / 1024
        }MB.`,
      },
      { status: 413 },
    );
  }

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : "untitled.csv";

  let analysis;
  try {
    ({ analysis } = analyzeCsv(body.csv));
  } catch (err) {
    if (err instanceof DataTooLargeError) {
      return NextResponse.json({ error: err.detail }, { status: 413 });
    }
    console.error("[nexus] analyze threw", err);
    return NextResponse.json(
      { error: "Couldn't read that file. It may not be delimited text." },
      { status: 422 },
    );
  }

  let id: string | null = null;
  if (storeConfigured()) {
    const session = await getSession();
    id = await saveDataset({ session, name, csv: body.csv, analysis });
  }

  return NextResponse.json({
    id: id ?? "ephemeral",
    name,
    analysis,
    stored: id !== null,
  });
}
