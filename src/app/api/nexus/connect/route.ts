import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getAccess, peekSession, recordRun } from "@/lib/nexus/store";
import {
  listTables,
  openConnection,
  profileTableSql,
  checkPublicHost,
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

export async function POST(req: Request) {
  const limit = rateLimit(`nexus-connect:${clientKey(req.headers)}`, 6);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many connection attempts. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  /*
   * This is the paid tier, and it is the one feature where that is not
   * arbitrary. Everything else here costs a round trip; this opens an
   * outbound connection to someone else's database and runs a few
   * dozen aggregate queries against it, under a 60-second budget. It
   * is also the capability worth the most to the person using it,
   * which is exactly the wrong thing to give away for an email
   * address.
   *
   * An unnamed visitor is asked who they are. A named one who has not
   * bought anything gets the pitch rather than a wall: they have just
   * demonstrated they have a warehouse and want this pointed at it,
   * which is the most qualified a lead on this page ever gets.
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
  if (access.tier !== "pro") {
    return NextResponse.json(
      {
        error: "upgrade",
        reason:
          "Uploads are free and always will be. Pointing the engine at a live table is the paid tier — it runs against your own database instead of a file, with no row ceiling, and it is set up per client with a read-only user. Tell me about your data and I'll quote it.",
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

  const hostProblem = checkPublicHost(conn);
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
