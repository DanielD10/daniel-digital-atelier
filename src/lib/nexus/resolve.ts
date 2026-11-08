import { analyzeCsv } from "./analyze";
import { buildDemoCsv, DEMO_NAME } from "./demo";
import { loadDataset } from "./store";
import type { Analysis, Table } from "./types";

/**
 * Turn a dataset id into bytes and findings, wherever it lives.
 *
 * "demo" is not a row. It is generated from a fixed seed, so the same
 * bytes and therefore the same findings come out every time, and the
 * showpiece on the page costs no storage and needs no session. Real
 * uploads come back out of Postgres with their findings already
 * computed; only the CSV is re-parsed, and only when rows are asked for.
 */

export const DEMO_ID = "demo";

export interface Resolved {
  id: string;
  name: string;
  analysis: Analysis;
  table: Table;
}

/**
 * The demo is deterministic, so analysing it twice is wasted work.
 * Module scope survives for the life of a warm lambda, which covers the
 * burst of requests a single visitor makes.
 */
let demoCache: Resolved | null = null;

export function resolveDemo(): Resolved {
  if (demoCache) return demoCache;
  const csv = buildDemoCsv();
  const { table, analysis } = analyzeCsv(csv);
  demoCache = { id: DEMO_ID, name: DEMO_NAME, analysis, table };
  return demoCache;
}

/**
 * Load a stored dataset. `withTable` re-parses the CSV, which is only
 * needed for auditing rows and answering questions — a plain read of
 * the findings should not pay for it.
 */
export async function resolveStored(
  id: string,
  session: string,
  withTable: boolean,
): Promise<Resolved | null> {
  const record = await loadDataset(id, session, withTable);
  if (!record) return null;

  const analysis: Analysis = {
    table: {
      rows: record.rowCount,
      columns: record.columnCount,
      malformed: 0,
    },
    columns: record.columns,
    quality: record.quality,
    findings: record.findings,
    elapsedMs: 0,
  };

  if (!withTable || !record.csv) {
    return { id: record.id, name: record.name, analysis, table: { headers: [], rows: [], malformed: 0 } };
  }

  const reparsed = analyzeCsv(record.csv);
  return { id: record.id, name: record.name, analysis, table: reparsed.table };
}
