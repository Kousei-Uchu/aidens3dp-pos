// Location: tests/helpview.test.ts
// B7b: the Markdown subset, the flowchart reader and layout, and the real pages through both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineText, parseBlocks, parseInline } from '../src/lib/mdBlocks';
import { layoutFlowchart, parseFlowchart, wrapLabel } from '../src/lib/flowchart';
import { diagramBlocks, resolveLinks, selectDepth, trail } from '../src/lib/helpDocs';
import { loadPages } from '../scripts/build-help';

// ── inline ───────────────────────────────────────────────────────────────────
test('inline: bold, italic, code, page links, outside links, escapes', () => {
  const x = parseInline('a **b** *c* `d` [P](#/sales/cart) [W](https://x.org/y) \\*not\\*');
  assert.deepEqual(x.map(i => i.t), ['text', 'bold', 'text', 'italic', 'text', 'code', 'text', 'page', 'text', 'url', 'text']);
  assert.deepEqual(x.find(i => i.t === 'page'), { t: 'page', s: 'P', id: 'sales/cart' });
  assert.equal(inlineText(x).endsWith('*not*'), true);
});
test('inline: code is literal, an unmatched marker stays as text, odd links are text only', () => {
  assert.deepEqual(parseInline('`**x**`'), [{ t: 'code', s: '**x**' }]);
  assert.deepEqual(parseInline('2 * 3 and **open'), [{ t: 'text', s: '2 * 3 and **open' }]);
  assert.ok(parseInline('[click](javascript:alert(1))').every(i => i.t === 'text')); // never becomes a link
  assert.deepEqual(parseInline('[a](ftp://x)'), [{ t: 'text', s: 'a' }]);
});

// ── blocks ───────────────────────────────────────────────────────────────────
test('blocks: headings, paragraphs joined, lists nested by indent, numbered lists', () => {
  const b = parseBlocks('### Head\nline one\nline two\n\n- a\n  - a1\n  - a2\n- b\n\n1. one\n2. two');
  assert.equal(b[0].k, 'heading'); assert.equal((b[1] as any).inline[0].s, 'line one line two');
  const list = b[2] as any; assert.equal(list.k, 'list'); assert.equal(list.ordered, false); assert.equal(list.items.length, 2); assert.equal(list.items[0].children.length, 2);
  assert.equal((b[3] as any).ordered, true); assert.equal((b[3] as any).items.length, 2);
});
test('blocks: a wrapped list line joins its item', () => {
  const b = parseBlocks('- first part\n  second part\n- next'); const l = b[0] as any;
  assert.equal(l.items.length, 2); assert.equal(inlineText(l.items[0].inline), 'first part second part');
});
test('blocks: tables with alignment, a pipe escaped inside a cell, short rows padded', () => {
  const b = parseBlocks('| A | B |\n|:--|--:|\n| 1 | x\\|y |\n| 2 |\n\nafter');
  const t = b[0] as any; assert.equal(t.k, 'table'); assert.deepEqual(t.align, ['left', 'right']);
  assert.equal(inlineText(t.rows[0][1]), 'x|y'); assert.equal(t.rows[1].length, 2); assert.equal(b[1].k, 'para');
});
test('blocks: code fences keep their text (even ## and |), mermaid becomes a diagram, a missing close ends at the end', () => {
  const b = parseBlocks('```text\n## not a heading\n| a | b |\n```\n```mermaid\nflowchart TD\nA-->B\n```\n```\nunclosed');
  assert.deepEqual(b.map(x => x.k), ['code', 'diagram', 'code']); assert.equal((b[0] as any).text, '## not a heading\n| a | b |'); assert.equal((b[2] as any).text, 'unclosed');
});
test('blocks: a table needs a separator row, otherwise it is a paragraph', () => {
  assert.equal(parseBlocks('a | b\nc | d')[0].k, 'para');
});
test('blocks: never loops on odd input', () => {
  for (const s of ['', '\n\n', '---', '#### x', '|', '- ', '```', '1)']) assert.doesNotThrow(() => parseBlocks(s));
});

// ── flowchart ────────────────────────────────────────────────────────────────
test('flowchart: shapes, labels on arrows, chains, ; and comments', () => {
  const f = parseFlowchart('flowchart LR\n%% note\nA[Start] --> B{Ok?} -->|yes| C(Done); B -->|no| D\n');
  assert.equal(f!.dir, 'LR'); assert.deepEqual(f!.nodes.map(n => [n.id, n.shape, n.label]), [['A', 'box', 'Start'], ['B', 'decision', 'Ok?'], ['C', 'round', 'Done'], ['D', 'box', 'D']]);
  assert.deepEqual(f!.edges, [{ from: 'A', to: 'B' }, { from: 'B', to: 'C', label: 'yes' }, { from: 'B', to: 'D', label: 'no' }]);
});
test('flowchart: a node can be labelled later; punctuation in labels is fine', () => {
  const f = parseFlowchart('flowchart TD\nA --> B\nA[persist \'pos\', 400 ms: debounce]');
  assert.equal(f!.nodes.find(n => n.id === 'A')!.label, "persist 'pos', 400 ms: debounce");
});
test('flowchart: a ; inside a label is part of the label, outside it separates statements', () => {
  const f = parseFlowchart('flowchart TD\nA[one; two] --> B; B --> C')!;
  assert.equal(f.nodes.find(n => n.id === 'A')!.label, 'one; two'); assert.equal(f.edges.length, 2);
});
test('flowchart: anything outside the subset returns null (the screen then shows the source)', () => {
  for (const s of ['sequenceDiagram\nA->>B: hi', 'flowchart TD\nsubgraph x\nA-->B\nend', 'flowchart TD\nstyle A fill:#f00', 'flowchart TD\nA --- B', '', 'flowchart TD', 'not a chart', 'flowchart TD\nA[ok] --> ???']) assert.equal(parseFlowchart(s), null, s);
});
test('wrapLabel: wraps at spaces, splits one very long word, never returns nothing', () => {
  assert.deepEqual(wrapLabel('aaa bbb ccc', 7), ['aaa bbb', 'ccc']); assert.ok(wrapLabel('x'.repeat(80)).length >= 3); assert.deepEqual(wrapLabel(''), ['']);
});
test('layout: layers follow the arrows, branches sit side by side, nothing overlaps', () => {
  const l = layoutFlowchart(parseFlowchart('flowchart TD\nA --> B\nA --> C\nB --> D\nC --> D')!);
  const n = Object.fromEntries(l.nodes.map(x => [x.id, x]));
  assert.ok(n.A.y < n.B.y && n.B.y < n.D.y); assert.equal(n.B.y, n.C.y); assert.ok(n.B.x !== n.C.x);
  for (const a of l.nodes) for (const b of l.nodes) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} overlaps ${b.id}`);
  for (const x of l.nodes) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= l.width + 0.001 && x.y + x.h <= l.height + 0.001);
});
test('layout: left-to-right runs along x; a loop does not hang and is marked as a back arrow', () => {
  const lr = layoutFlowchart(parseFlowchart('flowchart LR\nA --> B --> C')!); const n = Object.fromEntries(lr.nodes.map(x => [x.id, x]));
  assert.ok(n.A.x < n.B.x && n.B.x < n.C.x);
  const loop = layoutFlowchart(parseFlowchart('flowchart TD\nA --> B\nB --> C\nC --> A\nC --> C')!);
  assert.equal(loop.nodes.length, 3); assert.equal(loop.edges.filter(e => e.back).length, 2);
});
test('layout: edges join the faces of their nodes', () => {
  const l = layoutFlowchart(parseFlowchart('flowchart TD\nA --> B')!); const [a, b] = [l.nodes[0], l.nodes[1]]; const e = l.edges[0];
  assert.equal(e.y1, a.y + a.h); assert.equal(e.y2, b.y); assert.equal(e.x1, a.x + a.w / 2);
});

// ── the real pages ───────────────────────────────────────────────────────────
test('every flowchart in help/ is in the subset the app can draw', () => {
  let n = 0;
  for (const p of loadPages().pages) for (const src of diagramBlocks([p.lead, p.sections.basic, p.sections.deep, p.sections.advanced].join('\n'))) { n++; const f = parseFlowchart(src); assert.ok(f, `${p.id}: a diagram uses something the app cannot draw:\n${src}`); layoutFlowchart(f!); for (const nd of f!.nodes) assert.ok(!/[;"()]/.test(nd.label), `${p.id}: label "${nd.label}" has ; " ( or ), which the website's Mermaid may not draw`); }
  assert.ok(n >= 3);
});
test('every real page turns into blocks with no raw [[ ]] left, and links point at real pages', () => {
  const { pages } = loadPages(); const ids = new Set(pages.map(p => p.id)); const byId = Object.fromEntries(pages.map(p => [p.id, p]));
  for (const p of pages) for (const d of ['basic', 'deep', 'advanced'] as const) {
    const md = resolveLinks(selectDepth(p, d), id => byId[id]?.title, id => `#/${id}`);
    const blocks = parseBlocks(md);
    const walk = (xs: any[]) => xs.forEach(i => { if (i.t !== 'code') assert.ok(!/\[\[|\]\]/.test(i.s ?? ''), `${p.id}: raw link brackets`); if (i.t === 'page') assert.ok(ids.has(i.id), `${p.id}: link to ${i.id}`); });
    for (const b of blocks) {
      if (b.k === 'para' || b.k === 'heading') walk(b.inline);
      if (b.k === 'list') { const w = (items: any[]) => items.forEach(it => { walk(it.inline); w(it.children); }); w(b.items); }
      if (b.k === 'table') { b.head.forEach(walk); b.rows.forEach(r => r.forEach(walk)); }
    }
    assert.ok(blocks.length > 0);
  }
});

// ── the copy that ships inside the app ───────────────────────────────────────
import { builtinHelp, helpSetFrom } from '../src/lib/helpBuiltin';
test('the built-in help set loads, has the top page, and every page leads up to it', () => {
  const h = builtinHelp();
  assert.ok(h.index.byId.start && h.pages.length >= 6 && h.version.length === 8);
  for (const p of h.pages) assert.equal(trail(h.index, p.id)[0].id, 'start');
  assert.equal(builtinHelp(), h); // loaded once
});
test('helpSetFrom refuses rubbish and keeps a good bundle', () => {
  assert.equal(helpSetFrom(null), null); assert.equal(helpSetFrom({ version: 'x', pages: [] }), null);
  const h = builtinHelp(); const again = helpSetFrom(JSON.parse(JSON.stringify({ version: h.version, pages: h.pages.map(({ file: _f, ...r }) => r) })));
  assert.equal(again!.pages.length, h.pages.length);
});
test('every page at every depth gives some blocks, and Advanced has at least as many as Basic', () => {
  for (const p of builtinHelp().pages) {
    const n = (d: 'basic' | 'deep' | 'advanced') => parseBlocks(selectDepth(p, d)).length;
    assert.ok(n('basic') > 0 && n('deep') >= n('basic') && n('advanced') >= n('deep'), p.id);
  }
});
