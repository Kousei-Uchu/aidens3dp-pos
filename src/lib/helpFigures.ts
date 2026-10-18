// Location: src/lib/helpFigures.ts
// Help "screen figures" (B7e): a tiny, line-based description of a screen, drawn as a small picture instead of a
// screenshot. Pure: no React, no file access, so the app, the docs Worker's build and the tests all share it.
//
// A figure is a fenced block marked `screen` in a help page:
//
//   ```screen
//   title: The cart
//   sub: Register 1
//   label: Items
//   row: Highland Cow ×1 | $12.50
//   primary: !1 Charge  $21.50
//   note: The total updates as items are added.
//   ```
//
// Lines are `key: text`. Nothing else is allowed, so a typo is a build error and never a blank picture.
//   title / sub     the bar across the top of the picture (one each, optional)
//   label           a small heading inside the picture
//   row             a list line: `label | value`
//   tile            a grid tile: `label | value` (tiles flow three to a row)
//   key             a keypad key: `key: 7` (keys flow three to a row)
//   input           a field: `label | value`
//   button          a full-width button
//   primary         a full-width button in the accent colour, the one you would tap
//   text            a plain line
//   note            the caption under the picture (one, optional)
// Any of row, tile, key, input, button and primary may start with modifiers:
//   !N   a numbered badge, to point at the thing the words next to it are talking about (1 to 9, no repeats)
//   *    a ring round it, for "this is the bit that changed"

export type FigEl =
  | { k: 'label'; text: string }
  | { k: 'text'; text: string }
  | { k: 'row'; label: string; value?: string; badge?: number; hi?: boolean }
  | { k: 'tile'; label: string; value?: string; badge?: number; hi?: boolean }
  | { k: 'key'; label: string; badge?: number; hi?: boolean }
  | { k: 'input'; label: string; value?: string; badge?: number; hi?: boolean }
  | { k: 'button'; text: string; primary?: boolean; badge?: number; hi?: boolean };
export type Figure = { title?: string; sub?: string; note?: string; els: FigEl[] };
export type ParsedFigure = { figure: Figure } | { error: string };

const KEYS = ['title', 'sub', 'label', 'text', 'row', 'tile', 'key', 'input', 'button', 'primary', 'note'];
const HEAD = ['title', 'sub', 'note'] as const;

/** Leading `!N` and `*` modifiers, in either order, then the words. */
function mods(src: string): { badge?: number; hi?: boolean; text: string } {
  let badge: number | undefined; let hi = false; let t = src.trim(); let guard = 0;
  for (;;) {
    if (guard++ > 12) break;
    const b = /^!(\d)\s+/.exec(t);
    if (b) { badge = Number(b[1]); t = t.slice(b[0].length); continue; }
    if (/^\*/.test(t)) { hi = true; t = t.slice(1).trimStart(); continue; }
    break;
  }
  return { ...(badge ? { badge } : {}), ...(hi ? { hi } : {}), text: t.trim() };
}

/** Read a `screen` block. Returns the figure, or the reason it is wrong (with the line number). */
export function parseFigure(src: string): ParsedFigure {
  const figure: Figure = { els: [] }; const seen = new Set<keyof Figure>(); const badges = new Set<number>();
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n]; const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(line);
    if (!m) return { error: `line ${n + 1}: "${line.slice(0, 40)}" is not "key: text".` };
    const key = m[1].toLowerCase();
    if (!KEYS.includes(key)) return { error: `line ${n + 1}: there is no "${key}" line. Lines are ${KEYS.join(', ')}.` };
    const text = m[2].trim();
    if ((HEAD as readonly string[]).includes(key)) {
      if (seen.has(key as keyof Figure)) return { error: `line ${n + 1}: only one "${key}" line is allowed.` };
      if (!text) return { error: `line ${n + 1}: "${key}" needs something to say.` };
      (figure as Record<string, unknown>)[key] = text;
      seen.add(key as keyof Figure);
      continue;
    }
    if (key === 'label' || key === 'text') {
      if (!text) return { error: `line ${n + 1}: "${key}" needs something to say.` };
      figure.els.push({ k: key, text });
      continue;
    }
    if (!text) return { error: `line ${n + 1}: "${key}" needs something to say.` };
    const { badge, hi, text: words } = mods(text);
    if (!words) return { error: `line ${n + 1}: "${key}" needs words after its ${badge ? '!' : hi ? '*' : 'markers'}.` };
    if (badge) {
      if (badge > 9) return { error: `line ${n + 1}: the badge "!${badge}" must be from 1 to 9.` };
      if (badges.has(badge)) return { error: `line ${n + 1}: the badge !${badge} is used twice. Number them 1, 2, 3 … in the order they happen.` };
      badges.add(badge);
    }
    const flag = { ...(badge ? { badge } : {}), ...(hi ? { hi } : {}) };
    if (key === 'row' || key === 'tile' || key === 'input') {
      const [label, value, ...rest] = words.split('|').map(s => s.trim());
      if (rest.length) return { error: `line ${n + 1}: "${key}" takes at most two parts, "label | value".` };
      if (!label) return { error: `line ${n + 1}: "${key}" needs a label before the "|".` };
      figure.els.push({ k: key, label, ...(value ? { value } : {}), ...flag });
      continue;
    }
    if (key === 'key') figure.els.push({ k: 'key', label: words, ...flag });
    else figure.els.push({ k: 'button', text: words, ...(key === 'primary' ? { primary: true } : {}), ...flag });
  }
  if (!figure.els.length) return { error: 'a figure needs at least one row, tile, key, input, button, primary, label or text line.' };
  return { figure };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const badge = (b?: number) => (b ? `<span class="sf-badge">${b}</span>` : '');
const flagged = (e: unknown) => ((e as { hi?: boolean }).hi ? ' sf-hi' : '');
/** `label | value` for one line, with its badge if it has one. */
const pair = (e: { label: string; value?: string; badge?: number; hi?: boolean }) =>
  `${badge(e.badge)}<span class="sf-label">${esc(e.label)}</span>${e.value ? `<span class="sf-value">${esc(e.value)}</span>` : ''}`;
/** Group runs of tiles and keys so they flow three to a row, the way a group of like things should. */
function groups(els: FigEl[]): (FigEl | FigEl[])[] {
  const out: (FigEl | FigEl[])[] = []; let i = 0;
  while (i < els.length) {
    const k = els[i].k;
    if (k !== 'tile' && k !== 'key') { out.push(els[i]); i++; continue; }
    const run: FigEl[] = [];
    while (i < els.length && els[i].k === k) { run.push(els[i]); i++; }
    out.push(run);
  }
  return out;
}
/** The picture as HTML for the Docs site. Classes are styled in docs-server/src/index.ts; the app draws its own. */
export function figureToHTML(fig: Figure): string {
  const body = groups(fig.els).map(g => {
    if (Array.isArray(g)) {
      const k = g[0].k === 'tile' ? 'tile' : 'key';
      return `<div class="sf-grid sf-${k}s">${g.map(e => (k === 'tile'
        ? `<span class="sf-tile${flagged(e)}">${badge((e as { badge?: number }).badge)}<span class="sf-tile-label">${esc((e as { label: string }).label)}</span>${(e as { value?: string }).value ? `<span class="sf-tile-value">${esc((e as { value?: string }).value!)}</span>` : ''}</span>`
        : `<span class="sf-key${flagged(e)}">${badge((e as { badge?: number }).badge)}${esc((e as { label: string }).label)}</span>`)).join('')}</div>`;
    }
    const e = g as FigEl;
    switch (e.k) {
      case 'label': return `<div class="sf-label-head">${esc(e.text)}</div>`;
      case 'text': return `<div class="sf-text">${esc(e.text)}</div>`;
      case 'row': return `<div class="sf-row${flagged(e)}">${pair(e)}</div>`;
      case 'input': return `<div class="sf-input${flagged(e)}">${pair(e)}</div>`;
      case 'button': return `<div class="sf-button${e.primary ? ' sf-primary' : ''}${flagged(e)}">${badge(e.badge)}${esc(e.text)}</div>`;
      default: return '';
    }
  }).join('');
  const head = fig.title || fig.sub ? `<div class="sf-bar">${fig.title ? `<span class="sf-title">${esc(fig.title)}</span>` : ''}${fig.sub ? `<span class="sf-sub">${esc(fig.sub)}</span>` : ''}</div>` : '';
  return `<figure class="sf"><div class="sf-frame">${head}<div class="sf-body">${body}</div></div>${fig.note ? `<figcaption class="sf-note">${esc(fig.note)}</figcaption>` : ''}</figure>`;
}
