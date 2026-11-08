import { cookies } from "next/headers";
import type { Analysis, DatasetRecord } from "./types";

/**
 * Dataset persistence.
 *
 * PostgREST over plain fetch, matching the enquiry store — no SDK in the
 * dependency tree. The anon key is the only credential, and on its own
 * it opens nothing: every policy on the table is keyed to the
 * x-nexus-session header sent below, so a leaked key without a session
 * uuid matches no row.
 *
 * The session id lives in an httpOnly cookie, which means the browser
 * never sees it and never talks to Supabase directly. Every read and
 * write goes through a route handler on this origin.
 */

const COOKIE = "nx_session";
const TABLE = "nexus_datasets";
/** Keeps one visitor from filling the free tier on their own. */
const MAX_PER_SESSION = 8;

type Creds = { url: string; key: string };

function creds(): Creds | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

function headers(key: string, session: string, extra: Record<string, string> = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "x-nexus-session": session,
    ...extra,
  };
}

/** Read the caller's session, minting one if this is their first upload. */
export async function getSession(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;

  const fresh = crypto.randomUUID();
  jar.set(COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return fresh;
}

/** Read the session without creating one. Returns null for a first-time visitor. */
export async function peekSession(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export function storeConfigured(): boolean {
  return creds() !== null;
}

export async function saveDataset(args: {
  session: string;
  name: string;
  csv: string;
  analysis: Analysis;
}): Promise<string | null> {
  const c = creds();
  if (!c) return null;

  const id = crypto.randomUUID();
  const body = {
    id,
    session_id: args.session,
    name: args.name,
    source: "upload",
    byte_size: args.csv.length,
    row_count: args.analysis.table.rows,
    column_count: args.analysis.table.columns,
    columns: args.analysis.columns,
    quality: args.analysis.quality,
    findings: args.analysis.findings,
    csv: args.csv,
  };

  try {
    const res = await fetch(`${c.url}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: headers(c.key, args.session, { Prefer: "return=minimal" }),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[nexus] save failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
  } catch (err) {
    console.error("[nexus] save threw", err);
    return null;
  }

  // Housekeeping runs after the write, never before it: a failed reap
  // should not cost someone their upload.
  void reap(c, args.session);
  return id;
}

/** Light columns only — the CSV is never pulled for a listing. */
export async function listDatasets(session: string): Promise<DatasetRecord[]> {
  const c = creds();
  if (!c) return [];
  const cols = "id,name,source,row_count,column_count,byte_size,created_at";
  try {
    const res = await fetch(
      `${c.url}/rest/v1/${TABLE}?select=${cols}&order=created_at.desc&limit=${MAX_PER_SESSION}`,
      { headers: headers(c.key, session), cache: "no-store" },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      source: r.source as "upload" | "demo",
      rowCount: Number(r.row_count),
      columnCount: Number(r.column_count),
      byteSize: Number(r.byte_size),
      columns: [],
      quality: [],
      findings: [],
      narrative: null,
      createdAt: String(r.created_at),
    }));
  } catch {
    return [];
  }
}

export interface StoredDataset extends DatasetRecord {
  csv: string;
}

export async function loadDataset(
  id: string,
  session: string,
  withCsv = false,
): Promise<StoredDataset | null> {
  const c = creds();
  if (!c) return null;
  const cols = withCsv
    ? "id,name,source,row_count,column_count,byte_size,columns,quality,findings,narrative,csv,created_at"
    : "id,name,source,row_count,column_count,byte_size,columns,quality,findings,narrative,created_at";
  try {
    const res = await fetch(`${c.url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=${cols}`, {
      headers: headers(c.key, session),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const r = rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      name: String(r.name),
      source: r.source as "upload" | "demo",
      rowCount: Number(r.row_count),
      columnCount: Number(r.column_count),
      byteSize: Number(r.byte_size),
      columns: (r.columns ?? []) as StoredDataset["columns"],
      quality: (r.quality ?? []) as StoredDataset["quality"],
      findings: (r.findings ?? []) as StoredDataset["findings"],
      narrative: (r.narrative as string | null) ?? null,
      createdAt: String(r.created_at),
      csv: (r.csv as string | undefined) ?? "",
    };
  } catch {
    return null;
  }
}

export async function attachNarrative(id: string, session: string, narrative: string) {
  const c = creds();
  if (!c) return;
  try {
    await fetch(`${c.url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: headers(c.key, session, { Prefer: "return=minimal" }),
      body: JSON.stringify({ narrative }),
      cache: "no-store",
    });
  } catch {
    /* A missing narrative is cosmetic; never fail the request over it. */
  }
}

export async function deleteDataset(id: string, session: string): Promise<boolean> {
  const c = creds();
  if (!c) return false;
  try {
    const res = await fetch(`${c.url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: headers(c.key, session, { Prefer: "return=minimal" }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reap expired rows and trim a session back to its ceiling.
 *
 * There is no cron on the free tier, so expiry is opportunistic: every
 * upload pays a little forward by clearing whatever has aged out. The
 * delete-expired policy is open to any session precisely so this works
 * — it can only ever match rows that are already past their lifetime.
 */
async function reap(c: Creds, session: string) {
  const nowIso = new Date().toISOString();
  try {
    await fetch(`${c.url}/rest/v1/${TABLE}?expires_at=lt.${nowIso}`, {
      method: "DELETE",
      headers: headers(c.key, session, { Prefer: "return=minimal" }),
      cache: "no-store",
    });

    const res = await fetch(
      `${c.url}/rest/v1/${TABLE}?select=id&order=created_at.desc&offset=${MAX_PER_SESSION}`,
      { headers: headers(c.key, session), cache: "no-store" },
    );
    if (!res.ok) return;
    const stale = (await res.json()) as Array<{ id: string }>;
    for (const row of stale) {
      await fetch(`${c.url}/rest/v1/${TABLE}?id=eq.${row.id}`, {
        method: "DELETE",
        headers: headers(c.key, session, { Prefer: "return=minimal" }),
        cache: "no-store",
      });
    }
  } catch {
    /* Housekeeping is best-effort by design. */
  }
}
