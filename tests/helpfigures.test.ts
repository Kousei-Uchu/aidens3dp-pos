// Location: tests/helpfigures.test.ts
// B7e: help "screen figures" — a fenced ```screen block drawn as a small picture instead of a screenshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { figureToHTML, parseFigure } from '../src/lib/helpFigures';
import { makeBundle, parsePage, screenBlocks, validatePages } from '../src/lib/helpDocs';
import { parseBlocks } from '../src/lib/mdBlocks';
import { loadPages } from '../scripts/build-help';

const figure = (src: string) => { const r = parseFigure(src); assert.ok('figure' in r, 'error' in r ? r.error : 'unparsable'); return r.figure; };
const error = (src: string) => { const r = parseFigure(src); assert.ok('error' in r, 'expected it to be refused'); return r.error; };
const parsed = (file: string, raw: string) => { const r = parsePage(file, raw); assert.ok('page' in r, 'the page should parse'); return r.page; };

test('every kind of line, and the modifiers', () => {
  const f = figure(`title: Cash received
sub: Register 1
note: Tap the notes and coins.
label: Notes
text: Due $28.50
row: $20 | × 1
tile: $10 | × 2
key: 7
input: Billed to | Aidan
button: Undo
primary: !1 *Take cash`);
  assert.equal(f.title, 'Cash received'); assert.equal(f.sub, 'Register 1'); assert.equal(f.note, 'Tap the notes and coins.');
  assert.deepEqual(f.els, [
    { k: 'label', text: 'Notes' }, { k: 'text', text: 'Due $28.50' },
    { k: 'row', label: '$20', value: '× 1' }, { k: 'tile', label: '$10', value: '× 2' },
    { k: 'key', label: '7' }, { k: 'input', label: 'Billed to', value: 'Aidan' },
    { k: 'button', text: 'Undo' }, { k: 'button', text: 'Take cash', primary: true, badge: 1, hi: true },
  ]);
});
test('modifiers may come in either order, and blank lines and # comments are skipped', () => {
  assert.deepEqual(figure('primary: * !2 Charge').els, [{ k: 'button', text: 'Charge', primary: true, badge: 2, hi: true }]);
  assert.deepEqual(figure('\n# what the cashier sees\n\nrow: A | $1.00\n\n').els, [{ k: 'row', label: 'A', value: '$1.00' }]);
});
test('a line that is wrong says which line, and why', () => {
  assert.match(error('row: ok\nnonsense'), /^line 2: "nonsense" is not "key: text"/);
  assert.match(error('nonsense: yes'), /^line 1: there is no "nonsense" line/);
  assert.match(error('row: a | b | c'), /takes at most two parts/);
  assert.match(error('title: one\ntitle: two'), /only one "title"/);
  assert.match(error('primary: !1 x\nbutton: !1 y'), /the badge !1 is used twice/);
  assert.match(error('row:'), /needs something to say/);
  assert.match(error(''), /needs at least one/);
});
test('the picture is drawn as HTML, with the words escaped', () => {
  const html = figureToHTML(figure('title: Cart\nrow: <b>Hi</b> | $1.00\ntile: Cow | $2.00\ntile: Egg | $1.00\nprimary: !1 Charge\nnote: Watch this.'));
  assert.ok(html.startsWith('<figure class="sf">') && html.endsWith('</figure>'));
  assert.ok(html.includes('&lt;b&gt;Hi&lt;/b&gt;') && !html.includes('<b>Hi</b>'), 'the words are escaped, never raw markup');
  assert.ok(html.includes('<span class="sf-badge">1</span>'));
  assert.ok(html.includes('class="sf-button sf-primary"'));
  assert.ok(html.includes('<figcaption class="sf-note">Watch this.</figcaption>'));
  assert.ok(html.includes('class="sf-grid sf-tiles"'), 'tiles flow three to a row');
});
test('a screen block in a page becomes a picture in the Help screen, and a bad one falls back to plain code', () => {
  const blocks = parseBlocks('Words.\n\n```screen\ntitle: Cart\nrow: Cow | $1.00\n```\n');
  assert.equal(blocks[1].k, 'figure');
  assert.equal(parseBlocks('```screen\nnope: 1\n```')[0].k, 'code', 'a picture the checker would refuse is shown as its text');
});
test('the build pre-draws every picture for the Docs site, and a broken one is refused', () => {
  const page = parsed('a.md', '---\nid: a\ntitle: A\nparent: start\nsummary: s\n---\n\n## Basic\n\n```screen\ntitle: Cart\nrow: Cow | $1.00\n```\n');
  assert.equal(screenBlocks(page.sections.basic).length, 1);
  const bundle = makeBundle([page]);
  assert.equal(bundle.pages[0].figures!.length, 1);
  assert.match(bundle.pages[0].figures![0], /^<figure class="sf">/);
  const bad = parsed('b.md', '---\nid: b\ntitle: B\nparent: start\nsummary: s\n---\n\n## Basic\n\n```screen\nrow: a | b | c\n```\n');
  assert.ok(validatePages([bad]).some(i => /screen picture is wrong/.test(i.problem)));
});
test('every picture in help/ draws', () => {
  const { pages, issues } = loadPages(); assert.deepEqual(issues, []);
  let n = 0;
  for (const p of pages) for (const src of screenBlocks([p.lead, p.sections.basic, p.sections.deep, p.sections.advanced].join('\n'))) {
    n++; const f = parseFigure(src); assert.ok('figure' in f, `${p.id}: ${'error' in f ? f.error : ''}`); assert.ok(f.figure.els.length);
  }
  assert.ok(n >= 1, 'at least one help page shows a picture');
});
