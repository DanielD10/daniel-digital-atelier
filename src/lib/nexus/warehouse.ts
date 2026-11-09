import { Pool } from "pg";
import type { ColumnKind, ColumnProfile } from "./types";

/**
 * Run the engine against a database instead of a file.
 *
 * This is what removes the ceiling. The in-memory engine tops out
 * around a million rows because it materialises the table as
 * JavaScript strings; no amount of optimisation changes that, because
 * the representation is the problem. So for anything warehouse-scale
 * the work moves to where the data already is: the detectors become
 * SQL, the database does the aggregation over however many hundreds of
 * millions of rows there are, and what comes back over the wire is a
 * few hundred numbers.
 *
 * Everything here returns the same shapes the file engine produces, so
 * the panel, the plain-language layer, the change detection and the
 * email digest all work against a warehouse with no changes at all.
 *
 * Safety: the connection is forced read-only at the transaction level
 * and given a statement timeout, every identifier is quoted rather
 * than interpolated, and the only values that reach SQL as literals do
 * so as bound parameters. A client handing over a connection string is
 * extending a lot of trust and the code should earn it.
 */

/** No single query may run longer than this. A runaway scan is a bug. */
const STATEMENT_TIMEOUT_MS = 25_000;
const CONNECT_TIMEOUT_MS = 10_000;

export class WarehouseError extends Error {}

/**
 * Strip credentials out of anything on its way to a response or a log.
 *
 * Driver errors quote the thing that failed, which sometimes means the
 * whole DSN, and a password echoed into an HTTP response is a password
 * in someone's browser history and in the platform's request log. Both
 * forms of the secret get scrubbed: the `password=` keyword form and
 * the `user:pass@host` authority form, which the keyword pattern alone
 * misses entirely.
 */
export function scrub(text: string): string {
  return text
    .replace(/password=[^\s&'"]*/gi, "password=***")
    .replace(/(postgres(?:ql)?:\/\/[^:/@\s]+):[^@\s]*@/gi, "$1:***@");
}

/**
 * Quote an identifier for interpolation.
 *
 * Table and column names arrive from introspection, so they are
 * already real — but "already real" is exactly the assumption that
 * makes injection bugs, since a column can legitimately be named
 * `"; drop table x; --`. Doubling internal quotes and wrapping is the
 * only correct way to put a name into SQL, and it costs nothing.
 */
function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualified(schema: string, table: string): string {
  return `${ident(schema)}.${ident(table)}`;
}

export interface Target {
  schema: string;
  table: string;
}

/**
 * How many connections to open against the client's database.
 *
 * The detectors are independent and mostly round trips, so they want to
 * run together — but a single `Client` serialises queries, which is
 * both slower and deprecated in pg 9. A small pool gives real
 * parallelism without being rude to a database that has other work to
 * do; four is enough to keep the detectors busy and small enough that
 * nobody notices us in their connection count.
 */
const POOL_SIZE = 4;

export async function openConnection(connectionString: string): Promise<Pool> {
  if (!/^postgres(ql)?:\/\//i.test(connectionString.trim())) {
    throw new WarehouseError(
      "That doesn't look like a Postgres connection string. It should start with postgres:// or postgresql://.",
    );
  }

  /*
   * Read-only is set by the server at startup, not by a query we send
   * afterwards.
   *
   * The obvious implementation — a `connect` handler that issues SET
   * SESSION CHARACTERISTICS — is racy: the handler cannot await, so the
   * pool hands the client to a detector while the SET is still in
   * flight. That showed up as pg's "client is already executing a
   * query" warning, and the real problem behind that warning is a
   * window in which a connection is live and still writable. Passing
   * the GUCs as startup `options` closes the window: every connection
   * is read-only from its first byte, with no round trip.
   */
  const startupOptions = [
    "-c default_transaction_read_only=on",
    `-c statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    "-c idle_in_transaction_session_timeout=30000",
  ].join(" ");

  const base = {
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 10_000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    // Managed Postgres almost always requires TLS, and the certificate
    // chain varies by provider; encrypting without verifying the chain
    // is still far better than refusing to connect at all, which is
    // what strict verification would do for most hosts.
    ssl: { rejectUnauthorized: false },
  };

  let pool = new Pool({ ...base, max: POOL_SIZE, options: startupOptions });
  // A pool swallows the errors of an idle backend the server hangs up
  // on; without a listener that becomes an unhandled 'error' event and
  // takes the process down with it.
  pool.on("error", () => {});

  try {
    // Force one real connection now, so a bad string or an unreachable
    // host fails here with a usable message rather than inside a
    // detector where it reads as "that query failed".
    const probe = await pool.connect();
    probe.release();
  } catch (err) {
    await pool.end().catch(() => {});

    /*
     * Connection poolers in transaction mode — Supabase's 6543 port,
     * PgBouncer generally — reject the startup `options` parameter
     * outright. They are common enough that refusing to work with them
     * is not an option, so fall back to a single connection configured
     * with awaited statements. One connection is slower, but it is the
     * only way to be certain the posture is in place before a query
     * runs; correctness wins over the round trips.
     */
    if (/unsupported startup parameter|options/i.test((err as Error).message)) {
      pool = new Pool({ ...base, max: 1 });
      pool.on("error", () => {});
      try {
        const probe = await pool.connect();
        await probe.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
        await probe.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        probe.release();
        return pool;
      } catch (inner) {
        await pool.end().catch(() => {});
        throw new WarehouseError(`Couldn't connect: ${scrub((inner as Error).message)}`);
      }
    }

    const raw = (err as Error).message;
    /*
     * The driver's own words for the common failures are no help to
     * someone who is not a DBA, and the TLS one in particular reads
     * like a bug in this tool rather than a setting on their server.
     * Encryption is not negotiable here: the alternative is their
     * password crossing the public internet in the clear.
     */
    if (/does not support SSL/i.test(raw)) {
      throw new WarehouseError(
        "That server refused an encrypted connection, and this won't send credentials unencrypted. Turn on TLS on the database, or put it behind a connection pooler that terminates TLS.",
      );
    }
    if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) {
      throw new WarehouseError("That host doesn't resolve. Check the hostname in the string.");
    }
    if (/ETIMEDOUT|timeout expired/i.test(raw)) {
      throw new WarehouseError(
        "The connection timed out. The host is usually reachable but firewalled — allow this server's IP, or open the database to connections.",
      );
    }
    if (/ECONNREFUSED/i.test(raw)) {
      throw new WarehouseError("Nothing is listening on that host and port.");
    }
    if (/password authentication failed|no pg_hba|role .* does not exist/i.test(raw)) {
      throw new WarehouseError("The database rejected those credentials.");
    }
    throw new WarehouseError(`Couldn't connect: ${scrub(raw)}`);
  }

  return pool;
}

/** Tables the connection can actually read, for the picker. */
export async function listTables(client: Pool): Promise<Array<Target & { rows: number }>> {
  const { rows } = await client.query<{ schema: string; name: string; estimate: string }>(
    `select n.nspname as schema,
            c.relname  as name,
            greatest(c.reltuples, 0)::bigint::text as estimate
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r','p','v','m','f')
        and n.nspname not in ('pg_catalog','information_schema','pg_toast')
        and has_table_privilege(c.oid, 'SELECT')
      order by c.reltuples desc
      limit 200`,
  );
  return rows.map((r) => ({ schema: r.schema, table: r.name, rows: Number(r.estimate) }));
}

/** Postgres types mapped onto the engine's own vocabulary. */
function kindFor(dataType: string): ColumnKind | null {
  const t = dataType.toLowerCase();
  if (/^(bool)/.test(t)) return "boolean";
  if (/(timestamp|date|time)/.test(t)) return "date";
  if (/^(money)/.test(t)) return "currency";
  if (/^(smallint|integer|bigint|int2|int4|int8)/.test(t)) return "integer";
  if (/^(numeric|decimal|real|double|float)/.test(t)) return "number";
  if (/^(text|varchar|char|citext|uuid|name)/.test(t)) return "category";
  return null;
}

export interface WarehouseColumn extends ColumnProfile {
  /** The raw Postgres type, kept for the schema panel. */
  pgType: string;
}

/**
 * Profile every column in one pass over the table.
 *
 * One query rather than a query per column: on a hundred-million-row
 * table the scan is the expensive part, and doing it forty times to
 * learn forty columns' statistics would take forty times as long for
 * no extra information.
 */
export async function profileTableSql(
  client: Pool,
  target: Target,
): Promise<{ columns: WarehouseColumn[]; rowCount: number }> {
  const { rows: cols } = await client.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type
       from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [target.schema, target.table],
  );
  if (cols.length === 0) {
    throw new WarehouseError(`No readable columns on ${target.schema}.${target.table}.`);
  }

  const rel = qualified(target.schema, target.table);
  const parts: string[] = ["count(*)::bigint as __rows"];

  for (let i = 0; i < cols.length; i++) {
    const c = ident(cols[i].column_name);
    const kind = kindFor(cols[i].data_type);
    parts.push(`count(${c})::bigint as ${ident(`n_${i}`)}`);
    parts.push(`count(distinct ${c})::bigint as ${ident(`d_${i}`)}`);

    if (kind === "integer" || kind === "number" || kind === "currency") {
      const num = `(${c})::double precision`;
      parts.push(`min(${num}) as ${ident(`mn_${i}`)}`);
      parts.push(`max(${num}) as ${ident(`mx_${i}`)}`);
      parts.push(`avg(${num}) as ${ident(`av_${i}`)}`);
      parts.push(`percentile_cont(0.25) within group (order by ${num}) as ${ident(`q1_${i}`)}`);
      parts.push(`percentile_cont(0.5)  within group (order by ${num}) as ${ident(`md_${i}`)}`);
      parts.push(`percentile_cont(0.75) within group (order by ${num}) as ${ident(`q3_${i}`)}`);
      parts.push(`sum(${num}) as ${ident(`sm_${i}`)}`);
      parts.push(`stddev_samp(${num}) as ${ident(`sd_${i}`)}`);
    } else if (kind === "date") {
      parts.push(`min(${c})::text as ${ident(`mn_${i}`)}`);
      parts.push(`max(${c})::text as ${ident(`mx_${i}`)}`);
    }
  }

  const { rows } = await client.query<Record<string, string | number | null>>(
    `select ${parts.join(", ")} from ${rel}`,
  );
  const r = rows[0] ?? {};
  const rowCount = Number(r.__rows ?? 0);

  const columns: WarehouseColumn[] = cols.map((c, i) => {
    const kind = kindFor(c.data_type) ?? "text";
    const nonNull = Number(r[`n_${i}`] ?? 0);
    const distinct = Number(r[`d_${i}`] ?? 0);

    const profile: WarehouseColumn = {
      name: c.column_name,
      index: i,
      kind,
      pgType: c.data_type,
      missing: rowCount === 0 ? 0 : 1 - nonNull / rowCount,
      distinct,
      coercionFailures: 0,
      sample: [],
    };

    if (kind === "integer" || kind === "number" || kind === "currency") {
      const med = num(r[`md_${i}`]);
      const q1 = num(r[`q1_${i}`]);
      const q3 = num(r[`q3_${i}`]);
      // The interquartile range stands in for MAD: both are robust, and
      // 0.7413·IQR estimates the same quantity for normal data. Computing
      // a true MAD needs a second pass, which is not worth a scan.
      const spread = 0.7413 * (q3 - q1);
      profile.numeric = {
        min: num(r[`mn_${i}`]),
        max: num(r[`mx_${i}`]),
        mean: num(r[`av_${i}`]),
        median: med,
        mad: spread,
        stdev: num(r[`sd_${i}`]),
        q1,
        q3,
        sum: num(r[`sm_${i}`]),
        outlierCount: 0,
        histogram: [],
      };
    } else if (kind === "date") {
      const lo = r[`mn_${i}`] ? String(r[`mn_${i}`]).slice(0, 10) : "";
      const hi = r[`mx_${i}`] ? String(r[`mx_${i}`]).slice(0, 10) : "";
      const span =
        lo && hi ? Math.round((Date.parse(hi) - Date.parse(lo)) / 86400000) : 0;
      profile.temporal = { min: lo, max: hi, cadenceDays: 0, spanDays: span };
    }

    // High-cardinality text is an identifier, not a category.
    if (kind === "category" && rowCount > 0 && distinct > Math.max(64, rowCount * 0.5)) {
      profile.kind = distinct === nonNull ? "identifier" : "text";
    }

    /*
     * A primary key is not a metric, and the file engine already knows
     * it: an all-integer column with one distinct value per row is a
     * key. The warehouse profiler was classifying text keys but not
     * numeric ones, so `id` arrived as an ordinary integer and every
     * metric detector ran against it — four of the five slowest
     * queries in a 1.2M-row run were computing the median and the
     * correlations of a row number. The findings were nonsense and the
     * ranking threw them away afterwards, which is the expensive order
     * to discover that in.
     */
    if (
      (profile.kind === "integer" || profile.kind === "number") &&
      nonNull > 20 &&
      distinct === nonNull &&
      Number.isInteger(profile.numeric?.min) &&
      Number.isInteger(profile.numeric?.max)
    ) {
      profile.kind = "identifier";
    }

    return profile;
  });

  return { columns, rowCount };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Top levels of a categorical, for the profile and the detectors. */
export async function levelsFor(
  client: Pool,
  target: Target,
  column: string,
  limit = 12,
): Promise<Array<{ value: string; count: number }>> {
  const { rows } = await client.query<{ v: string | null; n: string }>(
    `select ${ident(column)}::text as v, count(*)::bigint as n
       from ${qualified(target.schema, target.table)}
      where ${ident(column)} is not null
      group by 1 order by 2 desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ value: r.v ?? "", count: Number(r.n) }));
}

export type Grain = "day" | "week" | "month";

/** A metric's median per period — the series the shift and trend detectors read. */
export async function seriesSql(
  client: Pool,
  target: Target,
  dateColumn: string,
  metric: string | null,
  grain: Grain,
): Promise<Series> {
  const bucket = `date_trunc('${grain}', ${ident(dateColumn)})`;
  const agg = metric
    ? `percentile_cont(0.5) within group (order by (${ident(metric)})::double precision)`
    : `count(*)::double precision`;
  /*
   * The mean comes back beside the median on the same scan, and it is
   * not decoration. A median is the right summary for a metric with
   * outliers, but it is badly behaved on a mixture: when a table holds
   * several price populations and their proportions shift, the median
   * can hop from one cluster to the next and look like a step change
   * when nothing changed level at all. The only cheap way to catch
   * that is to watch the mean, which moves smoothly through a mix
   * shift — so when the two disagree sharply, the median is the one
   * lying and the detectors suppress the claim.
   */
  const meanAgg = metric
    ? `avg((${ident(metric)})::double precision)`
    : `count(*)::double precision`;

  /*
   * The first and last day present in each bucket come back too, so a
   * partial period can be identified exactly rather than guessed at
   * from its row count.
   */
  const { rows } = await client.query<{
    b: string; v: string; m: string; n: string; lo: string; hi: string; e: string;
  }>(
    `select ${bucket}::date::text as b,
            ${agg} as v,
            ${meanAgg} as m,
            count(*)::bigint as n,
            min(${ident(dateColumn)})::date::text as lo,
            max(${ident(dateColumn)})::date::text as hi,
            (${bucket} + interval '1 ${grain}' - interval '1 day')::date::text as e
       from ${qualified(target.schema, target.table)}
      where ${ident(dateColumn)} is not null
        ${metric ? `and ${ident(metric)} is not null` : ""}
      group by 1, 7 order by 1
      limit 2000`,
  );
  return trimPartialBuckets({
    labels: rows.map((r) => r.b),
    values: rows.map((r) => num(r.v)),
    means: rows.map((r) => num(r.m)),
    counts: rows.map((r) => Number(r.n)),
    spans: rows.map((r) => ({ start: r.b, first: r.lo, last: r.hi, end: r.e })),
  });
}

export interface Series {
  labels: string[];
  values: number[];
  /** Per-bucket mean, for cross-checking a median that may be mixture-driven. */
  means: number[];
  /** Rows per bucket. */
  counts: number[];
  /**
   * Each bucket's calendar boundaries against the data actually in it:
   * `start`/`end` are the period, `first`/`last` the dates present.
   */
  spans?: Array<{ start: string; first: string; last: string; end: string }>;
}

/**
 * Drop a materially short bucket off either end of a series.
 *
 * Real data almost never starts and stops on a period boundary, so the
 * first and last buckets usually cover a few days of a week or a month.
 * Left in, that lone short bucket is the single most reliable way to
 * manufacture a fake "volume fell 15% and stayed there" — the step is
 * real in the series and completely absent from the business. Anything
 * under 60% of the typical bucket is treated as partial rather than as
 * news.
 */
function trimPartialBuckets(s: Series): Series {
  if (s.labels.length < 4 || !s.spans) return s;

  /*
   * A period is partial when the data does not reach its edges: the
   * first bucket starts late, or the last one stops early. That is an
   * exact test against the calendar, which matters because the ratio
   * test this replaced let a five-of-seven-days opening week through at
   * 73% of a normal week and duly reported "row volume rose 9.3% and
   * stayed there" on a dataset of perfectly uniform volume.
   */
  const first = s.spans[0];
  const last = s.spans[s.spans.length - 1];
  let lo = 0;
  let hi = s.labels.length;
  if (first && first.first > first.start) lo = 1;
  if (last && last.last < last.end) hi -= 1;
  // Never trim away so much that nothing is left to look at.
  if (hi - lo < 4) return s;
  if (lo === 0 && hi === s.labels.length) return s;

  return {
    labels: s.labels.slice(lo, hi),
    values: s.values.slice(lo, hi),
    means: s.means.slice(lo, hi),
    counts: s.counts.slice(lo, hi),
    spans: s.spans.slice(lo, hi),
  };
}

/** Per-segment median and count of a metric. */
export async function segmentSql(
  client: Pool,
  target: Target,
  segment: string,
  metric: string,
): Promise<Array<{ level: string; median: number; mean: number; n: number }>> {
  // Mean alongside median for the same reason as in seriesSql: a
  // segment whose median sits in a different cluster of a mixture
  // looks wildly different from the rest while its mean barely moves.
  const { rows } = await client.query<{ l: string | null; m: string; a: string; n: string }>(
    `select ${ident(segment)}::text as l,
            percentile_cont(0.5) within group (order by (${ident(metric)})::double precision) as m,
            avg((${ident(metric)})::double precision) as a,
            count(*)::bigint as n
       from ${qualified(target.schema, target.table)}
      where ${ident(segment)} is not null and ${ident(metric)} is not null
      group by 1 having count(*) >= 15
      order by 3 desc limit 40`,
  );
  return rows.map((r) => ({
    level: r.l ?? "",
    median: num(r.m),
    mean: num(r.a),
    n: Number(r.n),
  }));
}

/** Per-segment rate of a boolean. */
export async function rateSql(
  client: Pool,
  target: Target,
  segment: string,
  flag: string,
): Promise<Array<{ level: string; hits: number; n: number }>> {
  const { rows } = await client.query<{ l: string | null; h: string; n: string }>(
    `select ${ident(segment)}::text as l,
            count(*) filter (where ${ident(flag)}) ::bigint as h,
            count(*)::bigint as n
       from ${qualified(target.schema, target.table)}
      where ${ident(segment)} is not null and ${ident(flag)} is not null
      group by 1 having count(*) >= 30
      order by 3 desc limit 40`,
  );
  return rows.map((r) => ({ level: r.l ?? "", hits: Number(r.h), n: Number(r.n) }));
}

/** Pairwise correlation, computed in the database. */
export async function corrSql(
  client: Pool,
  target: Target,
  a: string,
  b: string,
): Promise<{ r: number; n: number }> {
  const { rows } = await client.query<{ r: string | null; n: string }>(
    `select corr((${ident(a)})::double precision, (${ident(b)})::double precision) as r,
            count(*) filter (where ${ident(a)} is not null and ${ident(b)} is not null)::bigint as n
       from ${qualified(target.schema, target.table)}`,
  );
  return { r: num(rows[0]?.r), n: Number(rows[0]?.n ?? 0) };
}

/** A metric's median split either side of a date, for decomposition. */
export async function splitSql(
  client: Pool,
  target: Target,
  dateColumn: string,
  metric: string,
  segment: string,
  cutoff: string,
): Promise<Array<{ level: string; beforeAvg: number; afterAvg: number; nBefore: number; nAfter: number }>> {
  const { rows } = await client.query<Record<string, string | null>>(
    `select ${ident(segment)}::text as l,
            avg((${ident(metric)})::double precision) filter (where ${ident(dateColumn)} <  $1::timestamptz) as ba,
            avg((${ident(metric)})::double precision) filter (where ${ident(dateColumn)} >= $1::timestamptz) as aa,
            count(*) filter (where ${ident(dateColumn)} <  $1::timestamptz)::bigint as nb,
            count(*) filter (where ${ident(dateColumn)} >= $1::timestamptz)::bigint as na
       from ${qualified(target.schema, target.table)}
      where ${ident(segment)} is not null
        and ${ident(metric)} is not null
        and ${ident(dateColumn)} is not null
      group by 1 limit 40`,
    [cutoff],
  );
  return rows.map((r) => ({
    level: r.l ?? "",
    beforeAvg: num(r.ba),
    afterAvg: num(r.aa),
    nBefore: Number(r.nb ?? 0),
    nAfter: Number(r.na ?? 0),
  }));
}

/**
 * Rows behind a claim.
 *
 * The audit trail has to work the same way it does for a file, or the
 * whole argument collapses at exactly the scale where checking matters
 * most. The filter is built from introspected column names and bound
 * parameters, never from anything a caller typed.
 */
export async function sampleRowsSql(
  client: Pool,
  target: Target,
  filter: { column: string; value: string } | null,
  limit = 60,
): Promise<{ headers: string[]; rows: string[][] }> {
  const where = filter ? `where ${ident(filter.column)}::text = $1` : "";
  const params = filter ? [filter.value, limit] : [limit];
  const { rows, fields } = await client.query(
    `select * from ${qualified(target.schema, target.table)} ${where} limit $${params.length}`,
    params,
  );
  const headers = fields.map((f) => f.name);
  return {
    headers,
    rows: rows.map((row: Record<string, unknown>) => headers.map((h) => cellText(row[h]))),
  };
}

/**
 * Render one value for the audit table.
 *
 * The driver hands back real JavaScript types, and `String(date)` on a
 * `date` column produces "Wed May 07 2025 00:00:00 GMT-0500 (Central
 * Daylight Time)" — forty characters of server timezone where the
 * column held "2025-05-07". Worse, it is the *server's* zone, so the
 * same row reads differently depending on where this happens to run.
 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    /*
     * Read it back the way the driver built it. pg parses a `date`
     * column into *local* midnight, so going through toISOString here
     * would shift the day backwards for any server west of UTC and
     * print 2025-05-06 for a row that says 2025-05-07.
     */
    const p = (n: number) => String(n).padStart(2, "0");
    const day = `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    const midnight =
      v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0 && v.getMilliseconds() === 0;
    return midnight ? day : `${day} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
