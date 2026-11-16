import { briefing, EVIDENCE_PLAIN, humanize, KIND_LABEL, plainMeaning } from "./plain";
import type { Analysis, Finding } from "./types";

/**
 * Getting the findings off the page.
 *
 * Everything this tool produces was trapped in one browser tab. The
 * whole pitch is that someone takes a finding to a manager, and the
 * only way to do that was to read it off a screen — no attachment, no
 * handout, nothing that survives the meeting. Two formats, because two
 * different people need it: a CSV for the analyst who is going to pull
 * it into their own model, and a printable report for the person who
 * has to hand something to a director.
 */

/**
 * One row per finding, every number it knows, in a file Excel opens
 * without complaining.
 */
export function findingsCsv(analysis: Analysis, datasetName: string): string {
  const headers = [
    "rank",
    "kind",
    "what_it_is",
    "headline",
    "what_it_means",
    "columns",
    "impact_0_to_1",
    "confidence",
    "say_this",
    "do_next",
    "how_far_it_goes",
    "evidence",
  ];

  const lines = [headers.map(csvCell).join(",")];

  analysis.findings.forEach((f, i) => {
    const b = briefing(f);
    lines.push(
      [
        String(i + 1),
        f.kind,
        KIND_LABEL[f.kind] ?? f.kind,
        f.headline,
        plainMeaning(f),
        f.columns.map(humanize).join("; "),
        f.impact.toFixed(2),
        confidenceWord(f),
        b.say,
        b.doNext.map((d, n) => `${n + 1}. ${d}`).join(" "),
        b.certainty,
        evidenceText(f),
      ]
        .map(csvCell)
        .join(","),
    );
  });

  if (analysis.quality.length) {
    lines.push("");
    lines.push(csvCell("Data quality issues found before any analysis ran"));
    lines.push(["severity", "issue", "detail", "rows_affected"].map(csvCell).join(","));
    for (const q of analysis.quality) {
      lines.push(
        [q.severity, q.title, q.detail, String(q.affected ?? "")].map(csvCell).join(","),
      );
    }
  }

  lines.push("");
  lines.push(csvCell(`Source: ${datasetName}`));
  lines.push(
    csvCell(
      `${analysis.table.rows.toLocaleString()} rows, ${analysis.table.columns} columns, analysed ${new Date().toISOString().slice(0, 10)}`,
    ),
  );
  lines.push(
    csvCell(
      "Every figure here describes rows that already exist. None of it is a forecast. Check the rows behind a finding before acting on it.",
    ),
  );

  /*
   * A BOM, because this file's whole job is to be opened in Excel.
   * Without one Excel reads UTF-8 as the local 8-bit codepage and
   * every curly quote and en dash in the prose arrives as mojibake —
   * which is what the reader sees first, before any of the content.
   */
  return "﻿" + lines.join("\r\n");
}

/**
 * Quote every cell, always.
 *
 * Conditional quoting means deciding, per cell, whether prose written
 * for humans happens to contain a comma — and this export is almost
 * entirely prose written for humans. Quoting unconditionally costs two
 * bytes and removes the question.
 */
function csvCell(v: string): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function confidenceWord(f: Finding): string {
  if (f.confidence >= 0.8) return "strong";
  if (f.confidence >= 0.5) return "fair";
  return "tentative";
}

function evidenceText(f: Finding): string {
  return Object.entries(f.evidence)
    .map(([k, v]) => `${EVIDENCE_PLAIN[k] ?? k}: ${v}`)
    .join("; ");
}

/** A filename that sorts, says what it is, and offends no filesystem. */
export function exportFilename(datasetName: string, ext: string): string {
  const stem = datasetName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  return `${stem || "dataset"}-findings-${day}.${ext}`;
}
