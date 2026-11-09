import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getAccess, peekSession, recordRun } from "@/lib/nexus/store";
import {
  listTables,
  openConnection,
  profileTableSql,
  sampleRowsSql,
  scrub,
  WarehouseError,
  type Target,
} from "@/lib/nexus/warehouse";
import { analyzeWarehouse } from "@/lib/nexus/warehouse-detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Point the engine at a database instead of a file.
 *
 * This is the path that removes the row ceiling: the detectors become
 * SQL, the database aggregates over however many rows there are, and
 * what crosses the wire is a few hundred numbers. A 1.2 million row
 * table that the file engine cannot open at all comes back in seconds.
 *
 * The connection string is used and discarded. Storing other people's
 * database credentials is a serious undertaking — encryption at rest,
 * key rotation, a breach plan — and none of that is worth doing before
 * someone is actually paying for scheduled runs against their
 * warehouse. Until then the honest answer to "where do you keep my
 * password" is "we don't".
 */

/**
 * Refuse private and loopback addresses.
 *
 * A public endpoint that opens outbound connections to anything it is
 * told to is a port scanner with extra steps: it would happily reach
 * the cloud metadata service, anything else inside the VPC, or a
 * colleague's laptop. Hostnames are not resolved here — DNS rebinding
 * would defeat that anyway — so this blocks the literal forms, and the
 * platform's own egress rules are the real boundary.
 */
function hostIsPrivate(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) {
    return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  if (/^169\.254\./.test(h)) return true; // link-local, incl. cloud metadata
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  return false;
}

function checkHost(connectionString: string): string | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return "That connection string couldn't be parsed.";
  }
  if (!url.hostname) return "That connection string has no host in it.";
  if (hostIsPrivate(url.hostname)) {
    return "That address is on a private network, which this can't reach. Use a host that's reachable from the internet, with your IP rules allowing it.";
  }
  return null;
}

export async function POST(req: Request) {
  const limit = rateLimit(`nexus-connect:${clientKey(req.headers)}`, 6);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many connection attempts. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  /*
   * Identification required, and this is the right feature to ask for
   * it on. Someone connecting a live database is a serious prospect
   * rather than a passer-by, and opening outbound connections on an
   * anonymous visitor's say-so is not a thing to offer the open web.
   */
  const session = await peekSession();
  const access = session ? await getAccess(session) : null;
  if (!access) {
    return NextResponse.json(
      {
        error: "locked",
        reason:
          "Connecting a live database is for named users — it opens an outbound connection from this server, so I'd like to know who's asking. Tell me who you are and it unlocks.",
      },
      { status: 402 },
    );
  }

  let body: {
    connectionString?: unknown;
    schema?: unknown;
    table?: unknown;
    rows?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const conn = typeof body.connectionString === "string" ? body.connectionString.trim() : "";
  if (!conn) return NextResponse.json({ error: "No connection string." }, { status: 400 });

  const hostProblem = checkHost(conn);
  if (hostProblem) return NextResponse.json({ error: hostProblem }, { status: 400 });

  let client;
  try {
    client = await openConnection(conn);
  } catch (err) {
    const message = err instanceof WarehouseError ? err.message : "Couldn't connect.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    // No table named: hand back what this login can read, so the
    // picker shows real options rather than asking them to type one.
    if (typeof body.table !== "string" || !body.table.trim()) {
      const tables = await listTables(client);
      return NextResponse.json({ tables: tables.slice(0, 100) });
    }

    const target: Target = {
      schema: typeof body.schema === "string" && body.schema.trim() ? body.schema.trim() : "public",
      table: body.table.trim(),
    };

    /*
     * Audit mode: show me the actual rows behind that number.
     * Same contract as /api/nexus/rows for uploads — a finding nobody
     * can check is a finding nobody should act on, and that holds just
     * as much when the table has 40 million rows as when it has 40.
     */
    if (body.rows && typeof body.rows === "object") {
      const spec = body.rows as { column?: unknown; value?: unknown };
      const filter =
        typeof spec.column === "string" && typeof spec.value === "string"
          ? { column: spec.column, value: spec.value }
          : null;
      const sample = await sampleRowsSql(client, target, filter, 60);
      return NextResponse.json(sample);
    }

    const { columns, rowCount } = await profileTableSql(client, target);
    const analysis = await analyzeWarehouse(client, target, columns, rowCount);

    const name = `${target.schema}.${target.table}`;
    if (session) void recordRun({ session, datasetName: name, analysis });

    return NextResponse.json({
      id: "warehouse",
      name,
      analysis,
      stored: false,
      source: "warehouse",
      rowCount,
    });
  } catch (err) {
    const message =
      err instanceof WarehouseError
        ? err.message
        : `That query failed: ${scrub((err as Error).message).slice(0, 200)}`;
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    await client.end().catch(() => {});
  }
}
