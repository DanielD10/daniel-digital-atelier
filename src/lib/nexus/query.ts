import { parseNumber } from "./profile";
import { median, quantile } from "./stats";
import type { ColumnProfile, Table } from "./types";

/**
 * A small, closed query language — and the reason Ask is trustworthy.
 *
 * The obvious way to answer a typed question is to have a model write
 * SQL. The problem is not that it writes bad SQL; it is that a wrong
 * answer looks exactly like a right one, and nobody checks a query they
 * did not write. So the model never touches the data here. It is given
 * the schema and the question and returns one of the five shapes below,
 * which this file validates against the real columns and executes
 * itself. A hallucinated column name fails validation instead of
 * silently returning a plausible number, and the arithmetic is the same
 * code path the findings engine already uses.
 *
 * The cost is that NEXUS can only answer questions expressible in these
 * five shapes. That is the right trade: a narrow answer that is correct
 * beats a broad one that might not be.
 */

export type FilterOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains";

export interface Filter {
  column: string;
  op: FilterOp;
  value: string | number;
}

export type Stat = "mean" | "median" | "sum" | "count" | "min" | "max" | "p90";

export type Plan =
  | { op: "aggregate"; metric: string; stat: Stat; groupBy?: string; filter?: Filter[]; limit?: number }
  | { op: "rate"; flag: string; groupBy?: string; filter?: Filter[] }
  | { op: "series"; metric?: string; dateColumn: string; stat: "median" | "count" | "sum"; filter?: Filter[] }
  | { op: "compare"; metric: string; groupBy: string; stat?: Stat; filter?: Filter[] }
  | { op: "describe"; column: string };

export interface QueryResult {
  /** Human-readable statement of what was computed. Assembled here, never by a model. */
  statement: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  /** Row indices behind the answer, so Ask is auditable like everything else. */
  rowRefs: number[];
  chart?: { labels: string[]; values: number[] };
}

export class PlanError extends Error {}

const TRUE_TOKENS = new Set(["true", "yes", "y", "t", "1"]);
const NUMERIC_KINDS = new Set(["number", "integer", "currency", "percent"]);

/** Resolve a model-supplied column name against the real schema. */
function column(columns: ColumnProfile[], name: unknown, what: string): ColumnProfile {
  if (typeof name !== "string" || !name.trim()) {
    throw new PlanError(`No ${what} column given.`);
  }
  const exact = columns.find((c) => c.name === name);
  if (exact) return exact;
  const loose = columns.find(
    (c) => c.name.toLowerCase().replace(/[\s_]/g, "") === name.toLowerCase().replace(/[\s_]/g, ""),
  );
  if (loose) return loose;
  throw new PlanError(
    `There's no column called "${name}". Available: ${columns.map((c) => c.name).join(", ")}.`,
  );
}

function passes(table: Table, columns: ColumnProfile[], filters: Filter[], r: number): boolean {
  for (const f of filters) {
    const col = column(columns, f.column, "filter");
    const raw = (table.rows[r][col.index] ?? "").trim();
    const wantNum = typeof f.value === "number" ? f.value : parseNumber(String(f.value));
    const gotNum = parseNumber(raw);

    switch (f.op) {
      case "eq":
        if (raw.toLowerCase() !== String(f.value).trim().toLowerCase()) return false;
        break;
      case "neq":
        if (raw.toLowerCase() === String(f.value).trim().toLowerCase()) return false;
        break;
      case "contains":
        if (!raw.toLowerCase().includes(String(f.value).trim().toLowerCase())) return false;
        break;
      case "gt":
        if (gotNum === null || wantNum === null || !(gotNum > wantNum)) return false;
        break;
      case "gte":
        if (gotNum === null || wantNum === null || !(gotNum >= wantNum)) return false;
        break;
      case "lt":
        if (gotNum === null || wantNum === null || !(gotNum < wantNum)) return false;
        break;
      case "lte":
        if (gotNum === null || wantNum === null || !(gotNum <= wantNum)) return false;
        break;
    }
  }
  return true;
}

function reduce(values: number[], stat: Stat): number {
  if (values.length === 0) return 0;
  switch (stat) {
    case "mean":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "median":
      return median(values);
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "count":
      return values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "p90":
      return quantile([...values].sort((a, b) => a - b), 0.9);
  }
}

function round(n: number): number {
  return Math.abs(n) >= 1000 ? Math.round(n) : Math.round(n * 1000) / 1000;
}

export function runPlan(
  plan: Plan,
  table: Table,
  columns: ColumnProfile[],
  dateValues: Map<number, Float64Array>,
): QueryResult {
  const filters = Array.isArray(plan.op === "describe" ? [] : plan.filter) ? (plan as { filter?: Filter[] }).filter ?? [] : [];
  const where = (r: number) => passes(table, columns, filters, r);
  const filterNote = filters.length
    ? ` where ${filters.map((f) => `${f.column} ${f.op} ${f.value}`).join(" and ")}`
    : "";

  switch (plan.op) {
    case "describe": {
      const col = column(columns, plan.column, "target");
      const rows: Array<Array<string | number>> = [
        ["type", col.kind],
        ["distinct", col.distinct],
        ["empty", `${(col.missing * 100).toFixed(1)}%`],
      ];
      if (col.numeric) {
        rows.push(
          ["min", round(col.numeric.min)],
          ["median", round(col.numeric.median)],
          ["mean", round(col.numeric.mean)],
          ["max", round(col.numeric.max)],
        );
      }
      if (col.temporal) rows.push(["from", col.temporal.min], ["to", col.temporal.max]);
      if (col.categorical) {
        for (const t of col.categorical.top.slice(0, 6)) rows.push([t.value || "(blank)", t.count]);
      }
      return { statement: `${col.name}`, columns: ["property", "value"], rows, rowRefs: [] };
    }

    case "aggregate": {
      const col = column(columns, plan.metric, "metric");
      if (!NUMERIC_KINDS.has(col.kind) && plan.stat !== "count") {
        throw new PlanError(`${col.name} isn't numeric, so "${plan.stat}" doesn't apply to it.`);
      }
      const group = plan.groupBy ? column(columns, plan.groupBy, "group") : null;

      if (!group) {
        const values: number[] = [];
        const refs: number[] = [];
        for (let r = 0; r < table.rows.length; r++) {
          if (!where(r)) continue;
          if (refs.length < 200) refs.push(r);
          const n = parseNumber(table.rows[r][col.index] ?? "");
          if (n !== null) values.push(n);
        }
        const v = reduce(values, plan.stat);
        return {
          statement: `${plan.stat} of ${col.name}${filterNote}`,
          columns: [plan.stat, "rows"],
          rows: [[round(v), values.length]],
          rowRefs: refs,
        };
      }

      const buckets = new Map<string, { values: number[]; refs: number[] }>();
      for (let r = 0; r < table.rows.length; r++) {
        if (!where(r)) continue;
        const key = (table.rows[r][group.index] ?? "").trim() || "(blank)";
        const n = parseNumber(table.rows[r][col.index] ?? "");
        const b = buckets.get(key) ?? { values: [], refs: [] };
        if (n !== null) b.values.push(n);
        if (b.refs.length < 20) b.refs.push(r);
        buckets.set(key, b);
      }
      const out = [...buckets.entries()]
        .map(([k, b]) => ({ k, v: reduce(b.values, plan.stat), n: b.values.length, refs: b.refs }))
        .sort((a, b) => b.v - a.v)
        .slice(0, Math.min(plan.limit ?? 20, 50));

      return {
        statement: `${plan.stat} of ${col.name} by ${group.name}${filterNote}`,
        columns: [group.name, plan.stat, "rows"],
        rows: out.map((o) => [o.k, round(o.v), o.n]),
        rowRefs: out.flatMap((o) => o.refs).slice(0, 200),
        chart: { labels: out.map((o) => o.k), values: out.map((o) => round(o.v)) },
      };
    }

    case "rate": {
      const flag = column(columns, plan.flag, "flag");
      const group = plan.groupBy ? column(columns, plan.groupBy, "group") : null;
      const buckets = new Map<string, { hits: number; n: number; refs: number[] }>();

      for (let r = 0; r < table.rows.length; r++) {
        if (!where(r)) continue;
        const raw = (table.rows[r][flag.index] ?? "").trim().toLowerCase();
        if (!raw) continue;
        const key = group ? (table.rows[r][group.index] ?? "").trim() || "(blank)" : "all rows";
        const b = buckets.get(key) ?? { hits: 0, n: 0, refs: [] };
        const hit = TRUE_TOKENS.has(raw);
        if (hit) {
          b.hits++;
          if (b.refs.length < 20) b.refs.push(r);
        }
        b.n++;
        buckets.set(key, b);
      }

      const out = [...buckets.entries()]
        .map(([k, b]) => ({ k, rate: b.n ? (b.hits / b.n) * 100 : 0, hits: b.hits, n: b.n, refs: b.refs }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 30);

      return {
        statement: `${flag.name} rate${group ? ` by ${group.name}` : ""}${filterNote}`,
        columns: [group ? group.name : "scope", "rate %", "true", "rows"],
        rows: out.map((o) => [o.k, Math.round(o.rate * 100) / 100, o.hits, o.n]),
        rowRefs: out.flatMap((o) => o.refs).slice(0, 200),
        chart: { labels: out.map((o) => o.k), values: out.map((o) => Math.round(o.rate * 100) / 100) },
      };
    }

    case "series": {
      const dateCol = column(columns, plan.dateColumn, "date");
      const dates = dateValues.get(dateCol.index);
      if (!dates) throw new PlanError(`${dateCol.name} isn't a date column.`);
      const metric = plan.metric ? column(columns, plan.metric, "metric") : null;

      const span = dateCol.temporal?.spanDays ?? 0;
      const grain: "day" | "week" | "month" = span <= 90 ? "day" : span <= 730 ? "week" : "month";

      const buckets = new Map<string, { values: number[]; n: number; refs: number[] }>();
      for (let r = 0; r < table.rows.length; r++) {
        if (!where(r)) continue;
        const t = dates[r];
        if (Number.isNaN(t)) continue;
        const d = new Date(t);
        const key =
          grain === "month"
            ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
            : d.toISOString().slice(0, 10);
        const b = buckets.get(key) ?? { values: [], n: 0, refs: [] };
        if (metric) {
          const n = parseNumber(table.rows[r][metric.index] ?? "");
          if (n !== null) b.values.push(n);
        }
        b.n++;
        if (b.refs.length < 8) b.refs.push(r);
        buckets.set(key, b);
      }

      const labels = [...buckets.keys()].sort();
      const values = labels.map((l) => {
        const b = buckets.get(l)!;
        if (!metric) return b.n;
        return plan.stat === "sum"
          ? b.values.reduce((a, c) => a + c, 0)
          : median(b.values);
      });

      return {
        statement: `${metric ? `${plan.stat} of ${metric.name}` : "row count"} per ${grain}${filterNote}`,
        columns: [grain, metric ? plan.stat : "rows"],
        rows: labels.map((l, i) => [l, round(values[i])]),
        rowRefs: labels.flatMap((l) => buckets.get(l)!.refs).slice(0, 200),
        chart: { labels, values: values.map(round) },
      };
    }

    case "compare": {
      const col = column(columns, plan.metric, "metric");
      const group = column(columns, plan.groupBy, "group");
      const stat = plan.stat ?? "median";
      return runPlan(
        { op: "aggregate", metric: col.name, stat, groupBy: group.name, filter: filters },
        table,
        columns,
        dateValues,
      );
    }
  }
}

/** Shape check before execution. Column names are checked by runPlan. */
export function validatePlan(raw: unknown): Plan {
  if (!raw || typeof raw !== "object") throw new PlanError("The planner returned nothing usable.");
  const p = raw as Record<string, unknown>;
  const op = p.op;
  if (op === "aggregate" || op === "rate" || op === "series" || op === "compare" || op === "describe") {
    return p as unknown as Plan;
  }
  throw new PlanError("That question doesn't map onto anything this panel can compute.");
}
