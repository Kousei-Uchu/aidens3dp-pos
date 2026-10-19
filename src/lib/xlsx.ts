// Location: src/lib/xlsx.ts
// Writes a real .xlsx workbook (the OOXML package, zipped) with one worksheet per table. Google Sheets and Excel both
// open it, and both keep the worksheets, which is the point: a "spreadsheet export" with a page per report.
//
// Pure and dependency-light: it uses fflate (already a dependency, used for compressed history) to zip the XML. Strings
// are written as inline strings, so there is no shared-string table to keep in step. No file or network access here.
import { strToU8, zipSync } from 'fflate';
import type { Sheet } from './exportSheets';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** A1 style column name for a 1-based column number: 1 -> A, 27 → AA. */
export function colName(n: number): string {
  let s = ''; let x = n;
  while (x > 0) { const rem = (x - 1) % 26; s = String.fromCharCode(65 + rem) + s; x = Math.floor((x - 1) / 26); }
  return s;
}
/** A value is written as a number only when it is one and has no leading zeros ("007" stays text). */
const numeric = (v: string) => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v);

/** Worksheet names: 31 characters at most, none of []:*?/\ , unique within the book. */
export function uniqueSheetName(raw: string, used: Set<string>): string {
  const clean = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Sheet';
  let name = clean.slice(0, 31);
  let i = 2;
  while (used.has(name.toLowerCase())) { const suffix = ` ${i++}`; name = clean.slice(0, 31 - suffix.length) + suffix; }
  used.add(name.toLowerCase());
  return name;
}

function cell(col: number, row: number, value: string): string {
  if (value === '') return '';
  const ref = `${colName(col)}${row}`;
  return numeric(value) ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}
function sheetXml(sheet: Sheet): string {
  const rows = [sheet.header, ...sheet.rows].map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(ci + 1, ri + 1, v ?? '')).join('')}</row>`).join('');
  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Build the workbook. An empty sheet list becomes a one-sheet book holding a short note, so the file is never broken. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: 'Empty', header: ['Nothing to export'], rows: [] as string[][] }];
  const used = new Set<string>();
  const named = list.map(s => ({ ...s, name: uniqueSheetName(s.name, used) }));

  const files: Record<string, Uint8Array> = {};
  files['[Content_Types].xml'] = strToU8(`${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  files['_rels/.rels'] = strToU8(`${XML_HEAD}<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  files['xl/workbook.xml'] = strToU8(`${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${DOC_REL}"><sheets>${named.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`${XML_HEAD}<Relationships xmlns="${RELS_NS}">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${DOC_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="${DOC_REL}/styles" Target="styles.xml"/></Relationships>`);
  files['xl/styles.xml'] = strToU8(`${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`);
  named.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });

  return zipSync(files, { level: 6 });
}
