import { NextResponse } from "next/server";

/**
 * The bookshelf.
 *
 * Two catalogues, because neither one on its own is the right
 * answer. Project Gutenberg is about eighty thousand books that
 * are properly, permanently free — public domain, full text, no
 * account, no queue — but it stops at roughly 1929. The Internet
 * Archive, through Open Library, has millions, most of them
 * borrowable rather than free-forever.
 *
 * So: ask both, label honestly what each link actually gets you,
 * and put the ones you can read right now at the top. A result
 * that says "read free" and lands on a paywall is worse than no
 * result.
 */

export const runtime = "nodejs";
// A catalogue of public-domain books does not change by the minute.
export const revalidate = 3600;

type Access = "read" | "borrow" | "info";

export type Book = {
  id: string;
  title: string;
  author: string;
  year: number | null;
  source: "gutenberg" | "openlibrary";
  access: Access;
  url: string;
  cover: string | null;
};

const UA = "daniel-digital-atelier (portfolio reading room; +https://github.com/DanielD10)";
const TIMEOUT = 7000;

async function getJSON(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT),
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

/* ── Project Gutenberg, via Gutendex ───────────────────── */

type GutenRaw = {
  id?: number;
  title?: string;
  authors?: Array<{ name?: string; death_year?: number | null }>;
  formats?: Record<string, string>;
};

async function gutenberg(q: string): Promise<Book[]> {
  const data = (await getJSON(
    `https://gutendex.com/books?search=${encodeURIComponent(q)}`,
  )) as { results?: GutenRaw[] };
  const rows = Array.isArray(data?.results) ? data.results : [];

  return rows.slice(0, 12).flatMap((b): Book[] => {
    if (typeof b.id !== "number" || !b.title) return [];
    const f = b.formats ?? {};
    /* The HTML edition reads in a browser. The key carries a
       charset suffix often enough that an exact lookup misses it,
       so match on the type and skip the zipped bundles. */
    const html =
      Object.entries(f).find(([k, v]) => k.startsWith("text/html") && !v.endsWith(".zip"))?.[1] ??
      null;
    /* Gutenberg's own author field is "Surname, Forename". */
    const raw = b.authors?.[0]?.name ?? "";
    const author = raw.includes(",")
      ? raw.split(",").map((s) => s.trim()).reverse().join(" ")
      : raw || "Unknown";

    return [
      {
        id: `g${b.id}`,
        title: b.title,
        author,
        year: num(b.authors?.[0]?.death_year),
        source: "gutenberg",
        access: "read",
        url: html ?? `https://www.gutenberg.org/ebooks/${b.id}`,
        cover: str(f["image/jpeg"]),
      },
    ];
  });
}

/* ── Open Library / Internet Archive ───────────────────── */

type OLRaw = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  ia?: string[];
  ebook_access?: string;
  cover_i?: number;
};

async function openLibrary(q: string): Promise<Book[]> {
  const fields = "key,title,author_name,first_publish_year,ia,ebook_access,cover_i";
  const data = (await getJSON(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=16&fields=${fields}`,
  )) as { docs?: OLRaw[] };
  const rows = Array.isArray(data?.docs) ? data.docs : [];

  return rows.flatMap((d): Book[] => {
    if (!d.key || !d.title) return [];
    const ia = Array.isArray(d.ia) ? d.ia[0] : null;
    const level = d.ebook_access ?? "no_ebook";

    /* printdisabled copies need a qualifying account, so calling
       them free to a general reader would be a lie. */
    let access: Access = "info";
    if (ia && level === "public") access = "read";
    else if (ia && level === "borrowable") access = "borrow";
    else if (level === "printdisabled" || level === "no_ebook") return [];

    return [
      {
        id: `o${d.key}`,
        title: d.title,
        author: d.author_name?.[0] ?? "Unknown",
        year: num(d.first_publish_year),
        source: "openlibrary",
        access,
        url: ia ? `https://archive.org/details/${ia}` : `https://openlibrary.org${d.key}`,
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      },
    ];
  });
}

/* ── Merge ─────────────────────────────────────────────── */

const norm = (s: string) =>
  s.toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ query: q, results: [] });

  /* Settled, not all: one catalogue being down is a thinner
     shelf, not an error page. */
  const [g, o] = await Promise.allSettled([gutenberg(q), openLibrary(q)]);
  const found = [
    ...(g.status === "fulfilled" ? g.value : []),
    ...(o.status === "fulfilled" ? o.value : []),
  ];

  const seen = new Set<string>();
  const merged: Book[] = [];
  for (const b of found) {
    const key = `${norm(b.title)}|${norm(b.author)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(b);
  }

  const wanted = norm(q);
  const rank = (b: Book) => {
    const t = norm(b.title);
    let score = 0;
    if (t === wanted) score -= 100;
    else if (t.startsWith(wanted)) score -= 60;
    else if (t.includes(wanted)) score -= 20;
    if (b.access === "read") score -= 12;
    else if (b.access === "borrow") score -= 4;
    if (b.source === "gutenberg") score -= 6;
    return score;
  };
  merged.sort((a, b) => rank(a) - rank(b));

  return NextResponse.json(
    {
      query: q,
      degraded: g.status === "rejected" || o.status === "rejected",
      results: merged.slice(0, 24),
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
