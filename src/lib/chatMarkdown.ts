// Location: src/lib/chatMarkdown.ts
// Turns an assistant reply into blocks the chat can draw (patch 0165). Models write more kinds of Markdown than help pages do
// (# headings, __bold__, _italic_, ~~strike~~, quotes, rules), so the text is tidied first and then read with the Help screen's
// own parser (mdBlocks.ts). Pure, so it runs in the node tests.
//
// Links are never tappable in chat. The model is told never to write one, and a link a model made up (a page id, or an outside
// address behind friendly words) must not be able to open anything. The words are kept and the address is dropped.
import { parseBlocks, type Block, type Inline, type ListItem } from './mdBlocks';

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** One line outside a code block, with the Markdown the Help parser does not know turned into what it does. */
function tidyLine(line: string): string | null {
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return null; // a horizontal rule
  let t = line.replace(/^\s{0,3}>\s?/, ''); // a quote shows as ordinary text
  t = t.replace(/^(\s*)#{5,6}\s+/, '$1#### ').replace(/^(\s*)#\s+/, '$1## '); // the parser reads two to four hashes
  t = t.replace(/(^|[^\w_])__([^_\s][^_]*?)__(?![\w_])/g, '$1**$2**'); // __bold__
  t = t.replace(/(^|[^\w_])_([^_\s][^_]*?)_(?![\w_])/g, '$1*$2*'); // _italic_
  t = t.replace(/~~([^~]+)~~/g, '$1'); // strike through is just text
  return t;
}

/** The text with the tidying applied everywhere except inside fenced code. */
export function tidyMarkdown(md: string): string {
  const out: string[] = []; let fence: string | null = null;
  for (const line of (md ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const f = FENCE.exec(line);
    if (fence) { out.push(line); if (f && f[1][0] === fence && line.trim().replace(/[`~]/g, '') === '') fence = null; continue; }
    if (f) { fence = f[1][0]; out.push(line); continue; }
    const t = tidyLine(line); if (t !== null) out.push(t);
  }
  return out.join('\n');
}

/** Links become their words. Bold and italic already hold plain text only. */
export const unlink = (xs: Inline[]): Inline[] => xs.map(x => (x.t === 'page' || x.t === 'url' ? { t: 'text', s: x.s } as Inline : x));
const unlinkItems = (items: ListItem[]): ListItem[] => items.map(i => ({ inline: unlink(i.inline), children: unlinkItems(i.children) }));

/** Mermaid has no place in a chat bubble, so a diagram is shown as the code it is. */
export function chatBlocks(md: string): Block[] {
  return parseBlocks(tidyMarkdown(md)).map((b): Block => {
    switch (b.k) {
      case 'heading': case 'para': return { ...b, inline: unlink(b.inline) };
      case 'list': return { ...b, items: unlinkItems(b.items) };
      case 'table': return { ...b, head: b.head.map(unlink), rows: b.rows.map(r => r.map(unlink)) };
      case 'diagram': return { k: 'code', lang: 'mermaid', text: b.source };
      default: return b;
    }
  });
}
