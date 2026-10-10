import { NextResponse } from "next/server";

/**
 * GET /api/earth/{z}/{row}/{col}   → proxied NASA GIBS tile
 * GET /api/earth/probe             → which layers actually work
 *
 * Proxying rather than fetching GIBS from the browser means CORS can
 * never taint the texture, Vercel's CDN caches tiles for a year, and
 * a GIBS layer rename degrades to a different NASA layer instead of
 * a blank hero.
 *
 * The probe route exists because GIBS layer identifiers and tile
 * matrix set names are easy to get wrong and fail silently. Opening
 * it tells you exactly which combination is live rather than making
 * you guess from a blank globe.
 *
 * GIBS is public domain, no API key.
 * Docs: https://nasa-gibs.github.io/gibs-api-docs/
 */

export const runtime = "nodejs";

type Candidate = {
  layer: string;
  set: string;
  ext: string;
  time: string;
  epsg: string;
};

/**
 * Tried in order; first that returns an image wins. Night layers
 * first, then day-side Blue Marble — a working planet beats no
 * planet if every night layer has moved.
 */
/**
 * Order matters, and the first two are not interchangeable.
 *
 * VIIRS_Black_Marble is a DAILY product. Asking for "default" gives
 * you the most recent day, which is a handful of orbital swaths —
 * diagonal bands of data with nothing between them, and no coverage
 * at all over the winter pole. That is what put a grey stripe across
 * the globe and left Antarctica missing.
 *
 * VIIRS_CityLights_2012 is the static global composite — the famous
 * "Earth at Night" mosaic, every pixel filled, no time dimension to
 * get wrong. For a backdrop that is what we want.
 */
const CANDIDATES: Candidate[] = [
  { layer: "VIIRS_CityLights_2012", set: "500m", ext: "jpg", time: "default", epsg: "epsg4326" },
  { layer: "VIIRS_Black_Marble", set: "500m", ext: "png", time: "default", epsg: "epsg4326" },
  // Day-side fallbacks. Wrong mood, but a planet beats no planet.
  { layer: "BlueMarble_NextGeneration", set: "500m", ext: "jpeg", time: "default", epsg: "epsg4326" },
  { layer: "BlueMarble_ShadedRelief_Bathymetry", set: "500m", ext: "jpeg", time: "default", epsg: "epsg4326" },
  // The 250m sets returned 400 for these layers — don't waste a
  // round trip to NASA rediscovering that on every cold start.
];

/** Remembered for the life of the serverless instance. */
let resolved: Candidate | null = null;

function tileUrl(c: Candidate, z: string, row: string, col: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/${c.epsg}/best/${c.layer}/default/${c.time}/${c.set}/${z}/${row}/${col}.${c.ext}`;
}

async function tryTile(c: Candidate, z: string, row: string, col: string) {
  try {
    const res = await fetch(tileUrl(c, z, row, col), {
      headers: { Accept: "image/*" },
      cache: "force-cache",
    });
    const type = res.headers.get("content-type") ?? "";
    return { res, ok: res.ok && type.startsWith("image/"), status: res.status, type };
  } catch (error) {
    return {
      res: null,
      ok: false,
      status: 0,
      type: error instanceof Error ? error.message : "fetch threw",
    };
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tile: string[] }> },
) {
  const { tile } = await params;

  // ── Diagnostics ───────────────────────────────────────────────
  if (tile.length === 1 && tile[0] === "probe") {
    const results = [];
    for (const c of CANDIDATES) {
      const r = await tryTile(c, "1", "0", "0");
      results.push({
        layer: c.layer,
        set: c.set,
        ext: c.ext,
        epsg: c.epsg,
        url: tileUrl(c, "1", "0", "0"),
        ok: r.ok,
        status: r.status,
        contentType: r.type,
      });
    }
    const working = results.filter((r) => r.ok);
    return NextResponse.json(
      {
        workingCount: working.length,
        firstWorking: working[0]?.layer ?? null,
        results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ── Tile ──────────────────────────────────────────────────────
  if (tile.length !== 3) {
    return NextResponse.json(
      { error: "Expected /api/earth/{z}/{row}/{col} or /api/earth/probe" },
      { status: 400 },
    );
  }

  const [z, row, col] = tile;
  if (![z, row, col].every((v) => /^\d{1,2}$/.test(v))) {
    return NextResponse.json({ error: "Tile coordinates must be integers." }, { status: 400 });
  }

  const order = resolved
    ? [resolved, ...CANDIDATES.filter((c) => c !== resolved)]
    : CANDIDATES;

  for (const candidate of order) {
    const r = await tryTile(candidate, z, row, col);
    if (!r.ok || !r.res) continue;

    resolved = candidate;
    const body = await r.res.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": r.res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "X-Earth-Layer": candidate.layer,
        "X-Earth-Set": candidate.set,
      },
    });
  }

  return NextResponse.json(
    { error: "No NASA imagery layer reachable.", hint: "Open /api/earth/probe" },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}
