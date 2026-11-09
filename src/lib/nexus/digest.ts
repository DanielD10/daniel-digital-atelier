import { escapeHtml } from "@/lib/contact-schema";
import { plainMeaning } from "./plain";
import type { Finding, QualityIssue } from "./types";

/**
 * The monthly email.
 *
 * This is the product's heartbeat. A panel someone has to remember to
 * open gets opened twice; an email that arrives saying what moved gets
 * read every month, and that difference is the whole case for a
 * recurring fee rather than a one-off invoice.
 *
 * It is deliberately short. Three findings, in plain words, and a link.
 * A digest that reproduces the panel gives nobody a reason to open the
 * panel, and a wall of statistics in an inbox is deleted unread.
 */

export interface DigestInput {
  datasetName: string;
  findings: Finding[];
  quality: QualityIssue[];
  rowCount: number;
  runAt: string | null;
  lastSentAt: string | null;
  cadence: string;
  panelUrl: string;
  unsubscribeUrl: string;
}

export function digestSubject(input: DigestInput): string {
  const top = input.findings[0];
  if (!top) return `${input.datasetName} — nothing new to flag`;
  // The subject line carries the finding, not the product's name. An
  // inbox is a list of claims competing for a click.
  return top.headline.length <= 78 ? top.headline : `${top.headline.slice(0, 75)}…`;
}

export function digestHtml(input: DigestInput): string {
  const { findings, quality, datasetName, rowCount, runAt } = input;

  const when = runAt
    ? new Date(runAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const serious = quality.filter((q) => q.severity !== "low").slice(0, 2);
  const top = findings.slice(0, 3);

  const body = top
    .map(
      (f, i) => `
      <tr><td style="padding:0 0 26px">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6c8f7f;margin-bottom:7px">
          ${String(i + 1).padStart(2, "0")}
        </div>
        <div style="font-size:18px;line-height:1.35;color:#0d1f18;font-weight:600;margin-bottom:9px">
          ${escapeHtml(f.headline)}
        </div>
        <div style="font-size:14px;line-height:1.6;color:#446054">
          ${escapeHtml(plainMeaning(f))}
        </div>
      </td></tr>`,
    )
    .join("");

  const issues = serious.length
    ? `<tr><td style="padding:0 0 26px">
         <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#b4791f;margin-bottom:7px">
           In the file itself
         </div>
         <div style="font-size:14px;line-height:1.6;color:#446054">
           ${serious.map((q) => escapeHtml(q.title)).join("; ")}. Worth clearing before acting on the figures above.
         </div>
       </td></tr>`
    : "";

  const empty = top.length === 0
    ? `<tr><td style="padding:0 0 26px;font-size:15px;line-height:1.6;color:#446054">
         Nothing cleared the bar this time. That is worth knowing in itself — no step changes,
         no segment behaving differently from the rest, and no data problems large enough to
         distort an average.
       </td></tr>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:32px 16px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:560px;background:#ffffff;border-radius:4px;padding:34px 34px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
    <tr><td style="padding-bottom:26px;border-bottom:1px solid #e3e9e6">
      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#1f8f63;font-weight:600">NEXUS</div>
      <div style="font-size:15px;color:#0d1f18;margin-top:8px;font-weight:600">${escapeHtml(datasetName)}</div>
      <div style="font-size:13px;color:#6c8f7f;margin-top:4px">
        ${rowCount.toLocaleString()} rows${when ? ` · last read ${when}` : ""}
      </div>
    </td></tr>
    <tr><td style="height:26px"></td></tr>
    ${issues}
    ${body}
    ${empty}
    <tr><td style="padding-top:4px">
      <a href="${input.panelUrl}"
         style="display:inline-block;background:#0d1f18;color:#ffffff;text-decoration:none;
                padding:13px 22px;border-radius:3px;font-size:13px;letter-spacing:.08em;text-transform:uppercase">
        Open the panel
      </a>
    </td></tr>
    <tr><td style="padding-top:26px;border-top:1px solid #e3e9e6;margin-top:26px">
      <div style="font-size:12px;line-height:1.6;color:#8aa399;padding-top:20px">
        Computed from the file you uploaded. It can be wrong — open the rows behind anything
        before you act on it, and sense-check it against what you already know.
        <br><br>
        Sent ${escapeHtml(input.cadence)}. <a href="${input.unsubscribeUrl}" style="color:#8aa399">Stop these</a>.
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/** The same thing in plain text, for clients that refuse HTML. */
export function digestText(input: DigestInput): string {
  const lines = [`NEXUS — ${input.datasetName}`, `${input.rowCount.toLocaleString()} rows`, ""];

  const serious = input.quality.filter((q) => q.severity !== "low").slice(0, 2);
  if (serious.length) {
    lines.push(`In the file itself: ${serious.map((q) => q.title).join("; ")}.`, "");
  }

  if (input.findings.length === 0) {
    lines.push("Nothing cleared the bar this time.");
  } else {
    input.findings.slice(0, 3).forEach((f, i) => {
      lines.push(`${i + 1}. ${f.headline}`, `   ${plainMeaning(f)}`, "");
    });
  }

  lines.push(input.panelUrl, "", `Sent ${input.cadence}. Stop these: ${input.unsubscribeUrl}`);
  return lines.join("\n");
}
