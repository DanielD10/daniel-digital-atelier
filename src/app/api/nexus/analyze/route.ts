import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { analyzeCsv, DataRejected } from "@/lib/nexus/analyze";
import { resolveDemo } from "@/lib/nexus/resolve";
import { countDatasets, getAccess, getSession, saveDataset, storeConfigured } from "@/lib/nexus/store";
import { BEYOND, entitlementsFor } from "@/lib/nexus/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A Pro-ceiling file measures around 20 seconds end to end, so the
   default 10s window would kill the request rather than the limit. */
export const maxDuration = 60;

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

  const session = await getSession();
  const access = await getAccess(session);
  const ent = entitlementsFor(access?.tier ?? "anonymous");

  if (body.csv.length > ent.maxBytes) {
    return NextResponse.json(
      {
        error: `That file is ${(body.csv.length / 1024 / 1024).toFixed(1)}MB and the sampler stops at ${
          ent.maxBytes / 1024 / 1024
        }MB.`,
        ceiling: "size",
        beyond: BEYOND,
      },
      { status: 413 },
    );
  }

  /*
   * Estimate the row count from newlines before parsing.
   *
   * Rejecting a 400k-row file only after the engine has profiled every
   * column means paying for the work in order to refuse it. Counting
   * line breaks is one pass over the string and is never an
   * underestimate by enough to matter — quoted newlines inflate it, and
   * inflating toward the ceiling is the safe direction.
   */
  let newlines = 0;
  for (let i = 0; i < body.csv.length; i++) if (body.csv.charCodeAt(i) === 10) newlines++;
  if (newlines > ent.maxRows * 1.05) {
    return NextResponse.json(
      {
        error: `That's roughly ${newlines.toLocaleString()} rows. The sampler stops at ${ent.maxRows.toLocaleString()}.`,
        ceiling: "rows",
        beyond: BEYOND,
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
    ({ analysis } = analyzeCsv(body.csv, { maxRows: ent.maxRows, maxBytes: ent.maxBytes }));
  } catch (err) {
    if (err instanceof DataRejected) {
      return NextResponse.json({ error: err.detail }, { status: err.status });
    }
    console.error("[nexus] analyze threw", err);
    return NextResponse.json(
      { error: "Couldn't read that file. It may not be delimited text." },
      { status: 422 },
    );
  }

  let id: string | null = null;
  let atCeiling = false;

  if (storeConfigured()) {
    /*
     * The dataset ceiling is enforced here rather than by refusing the
     * upload. Someone on their fourth file has already watched this
     * work three times — that is the warmest they will ever be, and
     * answering with a locked door instead of their findings would
     * waste it. They get the full analysis; what they lose is it being
     * kept, and they are told so alongside what the paid version does.
     */
    if ((await countDatasets(session)) >= ent.maxDatasets) {
      atCeiling = true;
    } else {
      id = await saveDataset({ session, name, csv: body.csv, analysis });
    }
  }

  return NextResponse.json({
    id: id ?? "ephemeral",
    name,
    analysis,
    stored: id !== null,
    tier: ent.tier,
    atCeiling,
    ...(atCeiling
      ? {
          ceiling: "datasets",
          ceilingNote: `The sampler keeps ${ent.maxDatasets} datasets per browser. This one is analysed but not saved.`,
          beyond: BEYOND,
        }
      : {}),
  });
}
