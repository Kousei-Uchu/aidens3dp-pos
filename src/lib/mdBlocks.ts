// Location: src/lib/mdBlocks.ts
// The small slice of Markdown that help pages use, turned into plain data the Help screen can draw (B7b). Pure.
// Supported: ### and #### headings, paragraphs, bullet and numbered lists (nested by 2-space indent), tables, fenced code,
// ```mermaid blocks, and inline **bold**, *italic*, `code` and [text](href). Anything else is shown as ordinary text.
// Links: `(#/page-id)` is a link to another help page (what resolveLinks produces); `http(s)://` is an outside link.
// Anything else in a link's brackets is shown as text only, so a typo can never open something unexpected.

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'bold'; s: string }
  | { t: 'italic'; s: string }
  | { t: 'code'; s: string }
  | { t: 'page'; s: string; id: string }
  | { t: 'url'; s: string; href: string };
export type ListItem = { inline: Inline[]; children: ListItem[] };
export type Align = 'left' | 'center' | 'right';
export type Block =
  | { k: 'heading'; level: 2 | 3 | 4; inline: Inline[] }
  | { k: 'para'; inline: Inline[] }
  | { k: 'list'; ordered: boolean; items: ListItem[] }
  | { k: 'table'; head: Inline[][]; align: Align[]; rows: Inline[][][] }
  | { k: 'code'; lang: string; text: string }
  | { k: 'diagram'; source: string };

/** Inline spans. Bold and italic hold plain text only (no nesting), which is all the pages need. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = []; let buf = ''; let i = 0;
  const flush = () => { if (buf) { out.push({ t: 'text', s: buf }); buf = ''; } };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#|]/.test(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
    if (ch === '`') { const e = src.indexOf('`', i + 1); if (e > i) { flush(); out.push({ t: 'code', s: src.slice(i + 1, e) }); i = e + 1; continue; } }
    if (ch === '*' && src[i + 1] === '*') { const e = src.indexOf('**', i + 2); if (e > i + 2) { flush(); out.push({ t: 'bold', s: src.slice(i + 2, e) }); i = e + 2; continue; } }
    if (ch === '*' && src[i + 1] !== '*' && src[i + 1] !== ' ') { const e = src.indexOf('*', i + 1); if (e > i + 1 && src[e - 1] !== ' ') { flush(); out.push({ t: 'italic', s: src.slice(i + 1, e) }); i = e + 1; continue; } }
    if (ch === '[') {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        flush(); const [whole, text, href] = m;
        if (href.startsWith('#/')) out.push({ t: 'page', s: text, id: href.slice(2) });
        else if (/^https?:\/\//i.test(href)) out.push({ t: 'url', s: text, href });
        else out.push({ t: 'text', s: text });
        i += whole.length; continue;
      }
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const NUMBER = /^(\s*)\d+[.)]\s+(.*)$/;
const splitRow = (line: string): string[] => {
  let t = line.trim(); if (t.startsWith('|')) t = t.slice(1); if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = []; let cur = '';
  for (let i = 0; i < t.length; i++) { if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; } else if (t[i] === '|') { cells.push(cur.trim()); cur = ''; } else cur += t[i]; }
  cells.push(cur.trim()); return cells;
};
const isSepRow = (line: string) => line.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n'); const out: Block[] = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const f = FENCE.exec(line);
    if (f) {
      const mark = f[1][0]; const lang = f[2].toLowerCase(); const buf: string[] = []; i++;
      while (i < lines.length) { const c = FENCE.exec(lines[i]); if (c && c[1][0] === mark && !c[2]) break; buf.push(lines[i]); i++; }
      i++; // the closing fence (a missing one just ends the block at the end of the text)
      const text = buf.join('\n').replace(/\s+$/, '');
      out.push(lang === 'mermaid' ? { k: 'diagram', source: text } : { k: 'code', lang, text });
      continue;
    }
    const h = /^(#{2,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) { out.push({ k: 'heading', level: h[1].length as 2 | 3 | 4, inline: parseInline(h[2]) }); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && isSepRow(lines[i + 1])) {
      const head = splitRow(line); const sep = splitRow(lines[i + 1]);
      const align: Align[] = head.map((_, c) => { const s = sep[c] ?? ''; return s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'right' : 'left'; });
      i += 2; const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { const cells = splitRow(lines[i]); rows.push(head.map((_, c) => parseInline(cells[c] ?? ''))); i++; }
      out.push({ k: 'table', head: head.map(parseInline), align, rows });
      continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const root: ListItem[] = []; const stack: { indent: number; items: ListItem[] }[] = [{ indent: -1, items: root }]; let ordered = NUMBER.test(line) && !BULLET.test(line);
      while (i < lines.length) {
        const l = lines[i]; const b = BULLET.exec(l); const n = b ? null : NUMBER.exec(l);
        if (b || n) {
          const indent = (b ? b[1] : n![1]).replace(/\t/g, '  ').length; const text = b ? b[3] : n![2];
          while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
          const item: ListItem = { inline: parseInline(text), children: [] };
          const top = stack[stack.length - 1]; top.items.push(item);
          stack.push({ indent, items: item.children }); i++; continue;
        }
        // a wrapped continuation line (indented, not blank, not a new block) joins the last item
        if (l.trim() && /^\s{2,}\S/.test(l) && !FENCE.test(l) && stack.length > 1) {
          const parent = stack[stack.length - 2]; const owner = parent.items[parent.items.length - 1];
          owner.inline = [...owner.inline, { t: 'text', s: ' ' }, ...parseInline(l.trim())]; i++; continue;
        }
        break;
      }
      out.push({ k: 'list', ordered, items: root });
      continue;
    }
    // paragraph: runs until a blank line or the start of another block
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !/^#{2,4}\s/.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isSepRow(lines[i + 1]))) { buf.push(lines[i].trim()); i++; }
    if (buf.length) out.push({ k: 'para', inline: parseInline(buf.join(' ')) });
    else i++; // safety: never loop on a line nothing recognises
  }
  return out;
}

/** The plain text of some inline spans (for search snippets and accessibility labels). */
export const inlineText = (xs: Inline[]): string => xs.map(x => x.s).join('');
