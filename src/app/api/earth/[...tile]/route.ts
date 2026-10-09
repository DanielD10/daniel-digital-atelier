import { NextResponse } from "next/server";

/**
 * GET /api/earth/{z}/{row}/{col}
 *
 * Proxies NASA GIBS night-lights tiles.
 *
 * Why proxy instead of hitting GIBS from the browser:
 *
 *   1. CORS. If GIBS ever stops sending permissive headers, a direct
 *      browser fetch taints the canvas and the texture silently dies.
 *      Same-origin can't break that way.
 *   2. Caching. Vercel's CDN caches these for a year, so a visitor
 *      pays for NASA's latency once globally, not once each.
 *   3. Layer drift. GIBS retires and renames layers. The probe below
 *      tries candidates in order and remembers the first that works,
 *      so a rename degrades to a different NASA layer instead of a
 *      blank hero.
 *
 * GIBS is public domain and needs no API key.
 * Docs: https://nasa-gibs.github.io/gibs-api-docs/
 */

export const runtime = "nodejs";
export const revalidate = 86400;

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";

type Candidate = { layer: string; set: string; ext: string; time: string };

/** Tried in order. First one that returns an image wins. */
const CANDIDATES: Candidate[] = [
  { layer: "VIIRS_Black_Marble", set: "500m", ext: "png", time: "default" },
  { layer: "VIIRS_CityLights_2012", set: "500m", ext: "jpg", time: "default" },
  { layer: "VIIRS_SNPP_DayNightBand_ENCC", set: "500m", ext: "png", time: "default" },
  // Day-side Blue Marble. Not the look we want, but a working planet
  // beats no planet if every night layer has gone away.
  { layer: "BlueMarble_NextGeneration", set: "500m", ext: "jpeg", time: "default" },
];

/** Remembered for the life of the serverless instance. */
let resolved: Candidate | null = null;

function tileUrl(c: Candidate, z: string, row: string, col: string): string {
  return `${GIBS}/${c.layer}/default/${c.time}/${c.set}/${z}/${row}/${col}.${c.ext}`;
}

async function fetchTile(
  c: Candidate,
  z: string,
  row: string,
  col: string,
): Promise<Response | null> {
  try {
    const res = await fetch(tileUrl(c, z, row, col), {
      headers: { Accept: "image/*" },
      next: { revalidate: 86400 },
    });

    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    return res;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tile: string[] }> },
) {
  const { tile } = await params;

  if (tile.length !== 3) {
    return NextResponse.json(
      { error: "Expected /api/earth/{z}/{row}/{col}" },
      { status: 400 },
    );
  }

  const [z, row, col] = tile;

  // Reject anything that isn't a plain integer before it reaches NASA.
  if (![z, row, col].every((v) => /^\d{1,2}$/.test(v))) {
    return NextResponse.json({ error: "Tile coordinates must be integers." }, { status: 400 });
  }

  // Known-good layer first, then the rest.
  const order = resolved
    ? [resolved, ...CANDIDATES.filter((c) => c.layer !== resolved!.layer)]
    : CANDIDATES;

  for (const candidate of order) {
    const upstream = await fetchTile(candidate, z, row, col);
    if (!upstream) continue;

    resolved = candidate;
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/png",
        // Immutable: a given tile of a static composite never changes.
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "X-Earth-Layer": candidate.layer,
      },
    });
  }

  // Every candidate failed. The client keeps its procedural globe.
  return NextResponse.json(
    { error: "No NASA imagery layer reachable." },
    { status: 502, headers: { "Cache-Control": "public, max-age=60" } },
  );
}
