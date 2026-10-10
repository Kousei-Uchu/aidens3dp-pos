// Location: src/lib/helpDocs.ts
// In-app help (B7): the page format, parser, checks and search. Pure: no React, no file access, so the app, the docs
// Worker, the build script and the tests all share it. The pages themselves are Markdown files in `help/`.
//
// A page is one Markdown file: a small header, an optional lead paragraph, then up to three depth sections.
//   ---
//   id: sales/cart-and-prices
//   title: The cart and how prices are worked out
//   parent: sales
//   summary: One line for lists and search results.
//   tags: [cart, discount]
//   related: [pay]
//   ---
//   Lead (shown at every depth).
//   ## Basic     what a staff member needs
//   ## Deep      how it works, in plain words
//   ## Advanced  the code, flowcharts, how to trace a fault
// Choosing a depth shows that section AND the ones above it (Deep shows Basic + Deep; Advanced shows all three).
// Links between pages are written [[page-id]] or [[page-id|link text]].

export const DEPTHS = ['basic', 'deep', 'advanced'] as const;
export type Depth = (typeof DEPTHS)[number];
export const DEPTH_LABEL: Record<Depth, string> = { basic: 'Basic', deep: 'Deep', advanced: 'Advanced' };
export const DEPTH_BLURB: Record<Depth, string> = {
  basic: 'What you need to know to use it.',
  deep: 'Plus a plain-English look at how it works.',
  advanced: 'Plus the code behind it, flowcharts, and how to trace a fault.',
};
export const ROOT_ID = 'start';

export type Page = {
  id: string; title: string; parent?: string; summary: string; tags: string[]; related: string[]; updated?: string;
  /** Text before the first depth heading. Shown at every depth. */
  lead: string;
  sections: Record<Depth, string>;
  /** Path of the source file, relative to `help/`, for error messages. */
  file: string;
};
export type PageIssue = { file: string; id?: string; problem: string };

// ── header ───────────────────────────────────────────────────────────────────
function unquote(s: string): string {
  const t = s.trim();
  return t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'")) ? t.slice(1, -1) : t;
}
/** A tiny `key: value` / `key: [a, b]` reader. Not YAML: no nesting, no multi-line values. */
export function parseFrontMatter(raw: string): { meta: Record<string, string | string[]>; body: string } | null {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  const head = text.slice(4, end);
  const after = text.slice(end + 4);
  if (after && !after.startsWith('\n')) return null;
  const meta: Record<string, string | string[]> = {};
  for (const line of head.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) return null;
    const v = m[2].trim();
    meta[m[1]] = v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1).split(',').map(unquote).filter(Boolean) : unquote(v);
  }
  return { meta, body: after.replace(/^\n/, '') };
}

// ── fences and sections ──────────────────────────────────────────────────────
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
/** True when every code fence that opens also closes. */
export function fencesBalanced(md: string): boolean {
  let open: string | null = null;
  for (const line of md.split('\n')) {
    const m = FENCE.exec(line); if (!m) continue;
    if (open === null) open = m[1][0]; else if (m[1][0] === open) open = null;
  }
  return open === null;
}
/** Split a page body into its lead and depth sections. Headings inside code fences do not count. */
export function splitSections(body: string): { lead: string; sections: Record<Depth, string> } {
  const out = { lead: '', sections: { basic: '', deep: '', advanced: '' } as Record<Depth, string> };
  let cur: Depth | 'lead' = 'lead'; let fence: string | null = null; const buf: Record<string, string[]> = { lead: [], basic: [], deep: [], advanced: [] };
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const f = FENCE.exec(line);
    if (f) { if (fence === null) fence = f[1][0]; else if (f[1][0] === fence) fence = null; }
    const h = fence === null ? /^##\s+(.+?)\s*$/.exec(line) : null;
    if (h) {
      const name = h[1].toLowerCase();
      if ((DEPTHS as readonly string[]).includes(name)) { cur = name as Depth; continue; }
    }
    buf[cur].push(line);
  }
  out.lead = buf.lead.join('\n').trim();
  for (const d of DEPTHS) out.sections[d] = buf[d].join('\n').trim();
  return out;
}

// ── pages ────────────────────────────────────────────────────────────────────
/** The id a file path must have: `sales/index.md` is `sales`, `start.md` is `start`, `sales/cart.md` is `sales/cart`. */
export function idForPath(file: string): string {
  const p = file.replace(/\\/g, '/').replace(/\.md$/i, '');
  return p === 'index' ? ROOT_ID : p.endsWith('/index') ? p.slice(0, -6) : p;
}
export function parsePage(file: string, raw: string): { page: Page } | { issue: PageIssue } {
  const fm = parseFrontMatter(raw);
  if (!fm) return { issue: { file, problem: 'Missing or unreadable header (the `---` block at the top).' } };
  const s = (k: string) => (typeof fm.meta[k] === 'string' ? (fm.meta[k] as string).trim() : '');
  const l = (k: string) => (Array.isArray(fm.meta[k]) ? (fm.meta[k] as string[]) : typeof fm.meta[k] === 'string' && s(k) ? [s(k)] : []);
  const sp = splitSections(fm.body);
  return { page: { id: s('id'), title: s('title'), ...(s('parent') ? { parent: s('parent') } : {}), summary: s('summary'), tags: l('tags'), related: l('related'), ...(s('updated') ? { updated: s('updated') } : {}), lead: sp.lead, sections: sp.sections, file } };
}

// ── links ────────────────────────────────────────────────────────────────────
const LINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;
const INLINE_CODE = /`[^`\n]*`/g;
/** Every [[id]] / [[id|text]] in some Markdown, outside code fences and `inline code`. */
export function extractLinks(md: string): { id: string; text?: string }[] {
  const out: { id: string; text?: string }[] = []; let fence: string | null = null;
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const f = FENCE.exec(line);
    if (f) { if (fence === null) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    for (const m of line.replace(INLINE_CODE, m => ' '.repeat(m.length)).matchAll(LINK)) out.push({ id: m[1].trim(), text: m[2]?.trim() });
  }
  return out;
}
/** Turn [[id|text]] into the viewer's own link. Unknown ids keep their text and lose the link, so nothing shows raw brackets. */
export function resolveLinks(md: string, titleOf: (id: string) => string | undefined, hrefFor: (id: string) => string): string {
  let fence: string | null = null;
  return md.replace(/\r\n?/g, '\n').split('\n').map(line => {
    const f = FENCE.exec(line);
    if (f) { if (fence === null) fence = f[1][0]; else if (f[1][0] === fence) fence = null; return line; }
    if (fence) return line;
    // text between single backticks is code: leave it exactly as written
    return line.split(/(`[^`\n]*`)/).map((seg, i) => (i % 2 ? seg : seg.replace(LINK, (_m, id: string, text?: string) => { const t = titleOf(id.trim()); const label = (text ?? t ?? id).trim(); return t === undefined ? label : `[${label}](${hrefFor(id.trim())})`; }))).join('');
  }).join('\n');
}
const allText = (p: Page) => [p.lead, ...DEPTHS.map(d => p.sections[d])].join('\n');
const DIAGRAM_START = /^(flowchart|graph|sequenceDiagram|stateDiagram(-v2)?|classDiagram|erDiagram|journey|gantt|pie)\b/;
/** The source of every ```mermaid block in some Markdown, so a viewer can draw it and the checker can look at it. */
export function diagramBlocks(md: string): string[] {
  const out: string[] = []; let open: { mark: string; mermaid: boolean; buf: string[] } | null = null;
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const f = FENCE.exec(line);
    if (!open) { if (f) open = { mark: f[1][0], mermaid: /^\s{0,3}(`{3,}|~{3,})\s*mermaid\s*$/i.test(line), buf: [] }; continue; }
    if (f && f[1][0] === open.mark) { if (open.mermaid) out.push(open.buf.join('\n').trim()); open = null; continue; }
    open.buf.push(line);
  }
  return out;
}
/** `##` headings left in a page after the depth headings are taken out. Inside a section use `###`, or the depth headings get confused. */
export function strayHeadings(md: string): string[] {
  const out: string[] = []; let fence: string | null = null;
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const f = FENCE.exec(line);
    if (f) { if (fence === null) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
    const h = fence === null ? /^##\s+(.+?)\s*$/.exec(line) : null; if (h) out.push(h[1]);
  }
  return out;
}
/** The Markdown to show at a depth: the lead, then each section down to and including that depth. Headings are re-levelled for display. */
export function selectDepth(p: Page, depth: Depth): string {
  const parts: string[] = []; if (p.lead) parts.push(p.lead);
  for (const d of DEPTHS) { if (p.sections[d]) parts.push(`## ${DEPTH_LABEL[d]}\n\n${p.sections[d]}`); if (d === depth) break; }
  return parts.join('\n\n');
}
/** Which depths a page has text for (so a viewer can say "no Advanced notes yet"). */
export const depthsPresent = (p: Page): Depth[] => DEPTHS.filter(d => p.sections[d].length > 0);

// ── the whole set ────────────────────────────────────────────────────────────
export type HelpIndex = {
  byId: Record<string, Page>;
  /** parent id → child ids, in title order */
  children: Record<string, string[]>;
  /** page id → ids of pages that link to it ([[…]] or `related`) */
  backlinks: Record<string, string[]>;
  roots: string[];
};
export function buildIndex(pages: Page[]): HelpIndex {
  const byId: Record<string, Page> = {}; for (const p of pages) if (p.id && !byId[p.id]) byId[p.id] = p;
  const children: Record<string, string[]> = {}; const back: Record<string, Set<string>> = {}; const roots: string[] = [];
  for (const p of Object.values(byId)) {
    if (p.parent && byId[p.parent]) (children[p.parent] ??= []).push(p.id); else roots.push(p.id);
    const targets = new Set([...p.related, ...extractLinks(allText(p)).map(l => l.id)]);
    for (const t of targets) if (t !== p.id && byId[t]) (back[t] ??= new Set()).add(p.id);
  }
  const byTitle = (a: string, b: string) => byId[a].title.localeCompare(byId[b].title);
  for (const k of Object.keys(children)) children[k].sort(byTitle);
  const backlinks: Record<string, string[]> = {}; for (const [k, v] of Object.entries(back)) backlinks[k] = [...v].sort(byTitle);
  return { byId, children, backlinks, roots: roots.sort(byTitle) };
}
/** From the root down to the page itself: the trail shown above a page. Stops if the chain is broken or loops. */
export function trail(idx: HelpIndex, id: string): Page[] {
  const out: Page[] = []; const seen = new Set<string>(); let cur: string | undefined = id;
  while (cur && idx.byId[cur] && !seen.has(cur)) { seen.add(cur); out.unshift(idx.byId[cur]); cur = idx.byId[cur].parent; }
  return out;
}

const ID_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
/** Everything that would make the help wrong or broken. An empty list means the set is sound. */
export function validatePages(pages: Page[]): PageIssue[] {
  const issues: PageIssue[] = []; const bad = (p: Page, problem: string) => issues.push({ file: p.file, id: p.id || undefined, problem });
  const seen = new Map<string, Page>();
  for (const p of pages) {
    if (!p.id) { bad(p, 'No `id`.'); continue; }
    if (!ID_OK.test(p.id)) bad(p, `The id "${p.id}" must be lowercase words joined by "-", with "/" between folders.`);
    if (p.id !== idForPath(p.file)) bad(p, `The id "${p.id}" does not match the file path (it should be "${idForPath(p.file)}").`);
    const dup = seen.get(p.id); if (dup) bad(p, `The id "${p.id}" is also used by ${dup.file}.`); else seen.set(p.id, p);
  }
  const ids = new Set(seen.keys());
  for (const p of pages) {
    if (!p.id) continue;
    if (!p.title) bad(p, 'No `title`.');
    if (!p.summary) bad(p, 'No `summary` (the one line shown in lists and search).');
    if (p.id === ROOT_ID) { if (p.parent) bad(p, `"${ROOT_ID}" is the top page and cannot have a parent.`); }
    else if (!p.parent) bad(p, 'No `parent`. Every page except the top one sits under another page.');
    else if (!ids.has(p.parent)) bad(p, `The parent "${p.parent}" does not exist.`);
    else if (p.parent === p.id) bad(p, 'A page cannot be its own parent.');
    if (!p.sections.basic) bad(p, 'No "## Basic" section. Every page needs the plain version.');
    const all = allText(p);
    if (![p.lead, ...DEPTHS.map(d => p.sections[d])].every(fencesBalanced)) bad(p, 'A code fence is opened and never closed (checked inside each section).');
    for (const d of diagramBlocks(all)) if (!DIAGRAM_START.test(d)) bad(p, `A mermaid block does not start with a diagram type such as "flowchart TD" (it starts "${d.split('\n')[0].slice(0, 30)}").`);
    for (const h of strayHeadings(all)) bad(p, `The heading "## ${h}" is not Basic, Deep or Advanced. Use "###" for headings inside a section.`);
    for (const r of p.related) if (!ids.has(r)) bad(p, `\`related\` points at "${r}", which does not exist.`);
    for (const l of extractLinks(all)) if (!ids.has(l.id)) bad(p, `The link [[${l.id}]] goes to a page that does not exist.`);
    if (p.updated && !/^\d{4}-\d{2}-\d{2}$/.test(p.updated)) bad(p, '`updated` must look like 2026-10-11.');
  }
  // parent loops (a → b → a): walk each chain
  for (const p of pages) {
    if (!p.id) continue; const path = new Set<string>(); let cur: string | undefined = p.id;
    while (cur && seen.has(cur)) { if (path.has(cur)) { bad(p, `The parents loop back on themselves (${[...path].join(' → ')} → ${cur}).`); break; } path.add(cur); cur = seen.get(cur)!.parent; }
  }
  return issues;
}

// ── search ───────────────────────────────────────────────────────────────────
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9$]+/).filter(Boolean);
/** Every search word must appear somewhere (title, summary, tags or text at the chosen depth). Title and tag hits rank highest. */
export function searchPages(pages: Page[], query: string, depth: Depth = 'advanced'): { page: Page; score: number }[] {
  const q = words(query); if (!q.length) return [];
  const out: { page: Page; score: number }[] = [];
  for (const p of pages) {
    const title = p.title.toLowerCase(), sum = p.summary.toLowerCase(), tags = p.tags.join(' ').toLowerCase(), body = selectDepth(p, depth).toLowerCase();
    let score = 0, ok = true;
    for (const w of q) {
      const s = (title.includes(w) ? 10 : 0) + (tags.includes(w) ? 6 : 0) + (sum.includes(w) ? 4 : 0) + (body.includes(w) ? 1 : 0);
      if (!s) { ok = false; break; } score += s;
    }
    if (ok) out.push({ page: p, score });
  }
  return out.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
}

// ── the bundle the app and the Worker both read ──────────────────────────────
export type HelpBundle = { version: string; pages: Omit<Page, 'file'>[] };
/** A short fingerprint of the content, so a device can tell whether its copy is the latest. FNV-1a, not security. */
export function contentVersion(pages: Omit<Page, 'file'>[]): string {
  let h = 0x811c9dc5; const s = JSON.stringify(pages);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export function makeBundle(pages: Page[]): HelpBundle {
  const list = [...pages].sort((a, b) => a.id.localeCompare(b.id)).map(({ file: _f, ...rest }) => rest);
  return { version: contentVersion(list), pages: list };
}
/** Read a bundle from untrusted JSON (a download, or an old saved copy). Returns null if it is not usable. */
export function readBundle(raw: unknown): HelpBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>; if (typeof r.version !== 'string' || !Array.isArray(r.pages)) return null;
  const pages: Omit<Page, 'file'>[] = [];
  for (const x of r.pages) {
    if (!x || typeof x !== 'object') continue; const p = x as Record<string, unknown>; const sec = (p.sections ?? {}) as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id || typeof p.title !== 'string') continue;
    const str = (v: unknown) => (typeof v === 'string' ? v : ''); const arr = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []);
    pages.push({ id: p.id, title: p.title, ...(str(p.parent) ? { parent: str(p.parent) } : {}), summary: str(p.summary), tags: arr(p.tags), related: arr(p.related), ...(str(p.updated) ? { updated: str(p.updated) } : {}), lead: str(p.lead), sections: { basic: str(sec.basic), deep: str(sec.deep), advanced: str(sec.advanced) } });
  }
  return pages.length ? { version: r.version, pages } : null;
}
