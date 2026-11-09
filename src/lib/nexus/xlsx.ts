import { ZipArchive, ZipError } from "./zip";

/**
 * Read an .xlsx into the same delimited text everything else consumes.
 *
 * Converting to CSV rather than straight to a table is deliberate: the
 * type inference, the quality checks and the detectors all already work
 * on delimited text, and a second ingestion path would be a second set
 * of bugs. What comes out here is what the user would have got by
 * choosing "Save as CSV", except that dates survive as ISO instead of
 * whatever their locale would have written.
 *
 * Excel was the single biggest point of friction in this thing: the
 * panel used to refuse a workbook and tell the person to go and export
 * it, at the exact moment they were most willing to try it.
 */

export class XlsxError extends Error {}

/** Excel's built-in number formats that mean "this is a date". */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export interface Sheet {
  name: string;
  path: string;
}

/** Decode the five XML entities Excel actually emits. */
function unescapeXml(s: string): string {
  if (!s.includes("&")) return s;
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * Does this number format render as a date?
 *
 * Custom formats are the awkward case: `d/m/yyyy` is a date and
 * `0.00"m"` is not, and the difference is whether the letters sit
 * inside quotes or behind a backslash. Stripping those first means the
 * remaining letters can be trusted.
 */
function isDateFormat(code: string): boolean {
  const bare = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(bare) && !/^[^dmyhs]*$/i.test(bare);
}

/**
 * Excel serial number → ISO date.
 *
 * The 1900 system counts days from 1899-12-30, not 1900-01-01, because
 * Excel deliberately kept Lotus 1-2-3's belief that 1900 was a leap
 * year. The off-by-two in the epoch is how you cancel that out without
 * special-casing dates before March 1900.
 */
function serialToIso(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(serial * 86400000);
  const d = new Date(ms);
  if (!Number.isFinite(ms)) return String(serial);
  const iso = d.toISOString();
  // A whole-day serial has no time worth carrying into the CSV.
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

/** Column letters to a zero-based index: A→0, Z→25, AA→26. */
function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function listSheets(buf: Buffer): Sheet[] {
  const zip = openZip(buf);
  return readSheetIndex(zip).sheets;
}

function openZip(buf: Buffer): ZipArchive {
  try {
    return new ZipArchive(buf);
  } catch (err) {
    if (err instanceof ZipError) throw new XlsxError(err.message);
    throw err;
  }
}

function readSheetIndex(zip: ZipArchive): { sheets: Sheet[]; date1904: boolean } {
  const workbook = zip.read("xl/workbook.xml");
  if (!workbook) {
    throw new XlsxError(
      zip.has("word/document.xml")
        ? "That's a Word document, not a spreadsheet."
        : "That ZIP isn't an Excel workbook — no xl/workbook.xml inside it.",
    );
  }

  // rId → part path, so a sheet can be found however the file names it.
  const rels = zip.read("xl/_rels/workbook.xml.rels") ?? "";
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    let path = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (!id || !path) continue;
    path = path.replace(/^\/?xl\//, "").replace(/^\.\//, "");
    target.set(id, `xl/${path}`);
  }

  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name) continue;
    const path = (rid && target.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    sheets.push({ name: unescapeXml(name), path });
  }
  if (sheets.length === 0) throw new XlsxError("That workbook has no sheets in it.");

  return { sheets, date1904: /date1904="(1|true)"/.test(workbook) };
}

export interface XlsxResult {
  csv: string;
  sheet: string;
  sheets: string[];
  rows: number;
}

/**
 * Convert one sheet to CSV. Defaults to the first sheet with data in
 * it, because the first sheet in a workbook is often a cover page.
 */
export function xlsxToCsv(buf: Buffer, wanted?: string): XlsxResult {
  const zip = openZip(buf);
  const { sheets, date1904 } = readSheetIndex(zip);

  const shared = readSharedStrings(zip);
  const styleIsDate = readStyleDateFlags(zip);

  /*
   * Pick the sheet with the most content, not the first one that has
   * two rows in it.
   *
   * The first sheet in a real workbook is very often a cover page —
   * a title, a "prepared by" line, nothing else — and the original
   * rule of "first sheet with at least two rows" described a cover
   * page exactly. Scoring on populated cells and requiring a shape
   * that could plausibly be a table picks the data every time.
   */
  if (wanted) {
    const sheet = sheets.find((s) => s.name === wanted);
    if (!sheet) throw new XlsxError(`That workbook has no sheet called "${wanted}".`);
    const xml = zip.read(sheet.path);
    if (!xml) throw new XlsxError(`Couldn't read the sheet "${wanted}".`);
    const { csv, rows } = sheetToCsv(xml, shared, styleIsDate, date1904);
    return { csv, sheet: sheet.name, sheets: sheets.map((s) => s.name), rows };
  }

  let best: { csv: string; rows: number; name: string; score: number } | null = null;
  for (const sheet of sheets.slice(0, 16)) {
    const xml = zip.read(sheet.path);
    if (!xml) continue;
    const { csv, rows, cells } = sheetToCsv(xml, shared, styleIsDate, date1904);
    // A table has a header and a body; two cells in a corner does not.
    const score = rows >= 2 && cells >= 6 ? cells : 0;
    if (!best || score > best.score) best = { csv, rows, name: sheet.name, score };
  }

  if (!best || best.score === 0) {
    throw new XlsxError(
      "No sheet in that workbook holds a table — just labels and blanks.",
    );
  }
  return { csv: best.csv, sheet: best.name, sheets: sheets.map((s) => s.name), rows: best.rows };
}

function readSharedStrings(zip: ZipArchive): string[] {
  const xml = zip.read("xl/sharedStrings.xml");
  if (!xml) return [];
  const out: string[] = [];
  // Each <si> is one string, but rich text splits it across several
  // <t> runs that have to be concatenated rather than taken separately.
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = "";
    for (const t of si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += t[1];
    out.push(unescapeXml(text));
  }
  return out;
}

/** Per style index, whether its number format renders as a date. */
function readStyleDateFlags(zip: ZipArchive): boolean[] {
  const xml = zip.read("xl/styles.xml");
  if (!xml) return [];

  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(m[0])?.[1]);
    const code = /formatCode="([^"]*)"/.exec(m[0])?.[1];
    if (Number.isFinite(id) && code) custom.set(id, unescapeXml(code));
  }

  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!cellXfs) return [];

  const flags: boolean[] = [];
  for (const xf of cellXfs[1].matchAll(/<xf\b[^>]*\/?>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(xf[0])?.[1] ?? "0");
    const code = custom.get(id);
    flags.push(code ? isDateFormat(code) : BUILTIN_DATE_FORMATS.has(id));
  }
  return flags;
}

function sheetToCsv(
  xml: string,
  shared: string[],
  styleIsDate: boolean[],
  date1904: boolean,
): { csv: string; rows: number; cells: number } {
  const lines: string[] = [];
  let width = 0;
  let cells = 0;

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
    const body = rowMatch[1];
    if (!body) {
      lines.push("");
      continue;
    }

    const row: string[] = [];
    for (const c of body.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const styleIdx = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? "-1");

      // Sparse sheets omit empty cells entirely, so the column has to
      // come from the reference rather than from arrival order.
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push("");

      let value = "";
      if (type === "inlineStr") {
        let t = "";
        for (const m of inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) t += m[1];
        value = unescapeXml(t);
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        if (type === "s") {
          value = shared[Number(raw)] ?? "";
        } else if (type === "b") {
          value = raw === "1" ? "true" : "false";
        } else if (type === "e") {
          value = "";
        } else if (raw !== "") {
          const n = Number(raw);
          if (Number.isFinite(n) && styleIdx >= 0 && styleIsDate[styleIdx]) {
            value = serialToIso(n, date1904);
          } else if (Number.isFinite(n) && !Number.isInteger(n)) {
            /*
             * Excel stores the full binary float, so a cell displaying
             * $74,708.79 arrives as 74708.78999999999 and lands in the
             * CSV looking like spurious precision. Twelve significant
             * digits is far more than business data carries and snaps
             * the representation back to what the person sees.
             */
            value = String(parseFloat(n.toPrecision(12)));
          } else {
            value = unescapeXml(raw);
          }
        }
      }
      row[at] = value;
      if (value !== "") cells++;
    }

    if (row.length > width) width = row.length;
    lines.push(row.map(csvCell).join(","));
  }

  // Trim trailing blank rows, which Excel leaves behind generously.
  while (lines.length > 0 && lines[lines.length - 1].replace(/,/g, "") === "") lines.pop();
  return { csv: lines.join("\n"), rows: lines.length, cells };
}
