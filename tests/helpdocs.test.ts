// Location: tests/helpdocs.test.ts
// B7: the help page format, its checks, search, and the real pages in help/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildIndex, contentVersion, depthsPresent, diagramBlocks, extractLinks, fencesBalanced, idForPath, makeBundle, parseFrontMatter, parsePage,
  readBundle, resolveLinks, searchPages, selectDepth, splitSections, strayHeadings, trail, validatePages, type Page,
} from '../src/lib/helpDocs';
import { BUNDLE_FILE, listPageFiles, loadPages, serialise } from '../scripts/build-help';

const page = (id: string, over: Partial<Page> = {}): Page => ({
  id, title: id.toUpperCase(), ...(id === 'start' ? {} : { parent: 'start' }), summary: `about ${id}`, tags: [], related: [], lead: '',
  sections: { basic: 'basic text', deep: '', advanced: '' }, file: id === 'start' ? 'start.md' : `${id}.md`, ...over,
});
const problems = (ps: Page[]) => validatePages(ps).map(i => i.problem);

// ── header ───────────────────────────────────────────────────────────────────
test('front matter: values, lists, quotes, colons in values, CRLF and BOM', () => {
  const r = parseFrontMatter('\uFEFF---\r\nid: a/b\r\ntitle: "Checkout: the screen"\r\ntags: [x, "y z", \'w\']\r\n# comment\r\nsummary: hi\r\n---\r\nBody\r\n');
  assert.ok(r);
  assert.equal(r!.meta.id, 'a/b'); assert.equal(r!.meta.title, 'Checkout: the screen');
  assert.deepEqual(r!.meta.tags, ['x', 'y z', 'w']); assert.equal(r!.body.trim(), 'Body');
});
test('front matter: missing, unclosed, or a line that is not key: value is rejected', () => {
  assert.equal(parseFrontMatter('no header'), null);
  assert.equal(parseFrontMatter('---\nid: a\nno close'), null);
  assert.equal(parseFrontMatter('---\nthis is not valid\n---\nx'), null);
  assert.equal(parseFrontMatter('---\nid: a\n---x'), null);
});
test('parsePage reports a missing header as an issue, not a throw', () => {
  const r = parsePage('x.md', 'hello'); assert.ok('issue' in r);
});

// ── sections ─────────────────────────────────────────────────────────────────
test('sections: lead, three depths, headings are case-insensitive, ### stays inside', () => {
  const s = splitSections('Lead\n\n## basic\nB1\n### Sub\nB2\n## DEEP\nD\n## Advanced\nA');
  assert.equal(s.lead, 'Lead'); assert.equal(s.sections.basic, 'B1\n### Sub\nB2'); assert.equal(s.sections.deep, 'D'); assert.equal(s.sections.advanced, 'A');
});
test('sections: a "## Deep" inside a code fence is not a heading', () => {
  const s = splitSections('## Basic\n```text\n## Deep\nnot a heading\n```\nstill basic\n## Deep\nreal');
  assert.ok(s.sections.basic.includes('not a heading') && s.sections.basic.includes('still basic')); assert.equal(s.sections.deep, 'real');
});
test('fences: balanced and unbalanced, and ~~~ does not close ```', () => {
  assert.ok(fencesBalanced('```\nx\n```')); assert.ok(!fencesBalanced('```\nx')); assert.ok(!fencesBalanced('```\nx\n~~~')); assert.ok(fencesBalanced('no fences'));
});
test('stray ## headings are found outside fences only', () => {
  assert.deepEqual(strayHeadings('## One\n```\n## Two\n```\n## Three'), ['One', 'Three']);
});
test('depth is cumulative: Basic, Deep = Basic + Deep, Advanced = all', () => {
  const p = page('x', { lead: 'LEAD', sections: { basic: 'B', deep: 'D', advanced: 'A' } });
  const b = selectDepth(p, 'basic'), d = selectDepth(p, 'deep'), a = selectDepth(p, 'advanced');
  assert.ok(b.startsWith('LEAD') && b.includes('B') && !b.includes('\nD') && !b.includes('A\n') && !b.includes('## Deep'));
  assert.ok(d.includes('## Basic') && d.includes('## Deep') && !d.includes('## Advanced'));
  assert.ok(a.includes('## Advanced'));
  assert.deepEqual(depthsPresent(p), ['basic', 'deep', 'advanced']); assert.deepEqual(depthsPresent(page('y')), ['basic']);
});

// ── ids and links ────────────────────────────────────────────────────────────
test('idForPath: index files take their folder, start.md is start', () => {
  assert.equal(idForPath('start.md'), 'start'); assert.equal(idForPath('sales/index.md'), 'sales');
  assert.equal(idForPath('sales/cart.md'), 'sales/cart'); assert.equal(idForPath('a\\b\\index.md'), 'a/b'); assert.equal(idForPath('index.md'), 'start');
});
test('links: plain and aliased, ignoring code fences and `inline code`', () => {
  const md = 'See [[a]] and [[b/c|the text]].\n`[[nope]]` and ```[[no]]```\n```\n[[fenced]]\n```\n[[d]]';
  assert.deepEqual(extractLinks(md), [{ id: 'a', text: undefined }, { id: 'b/c', text: 'the text' }, { id: 'd', text: undefined }]);
});
test('resolveLinks: known ids become links, unknown keep their text, code is untouched', () => {
  const titles: Record<string, string> = { a: 'Page A' };
  const out = resolveLinks('[[a]] [[a|custom]] [[gone|Gone text]] [[gone2]] `[[a]]`\n```\n[[a]]\n```', id => titles[id], id => `#/${id}`);
  assert.equal(out, '[Page A](#/a) [custom](#/a) Gone text gone2 `[[a]]`\n```\n[[a]]\n```');
});
test('diagram blocks are found, other fences are skipped', () => {
  const md = '```text\nflowchart no\n```\n```mermaid\nflowchart TD\nA-->B\n```\n~~~mermaid\ngraph LR\n~~~';
  assert.deepEqual(diagramBlocks(md), ['flowchart TD\nA-->B', 'graph LR']);
});

// ── validation ───────────────────────────────────────────────────────────────
test('a sound set has no problems', () => {
  assert.deepEqual(problems([page('start'), page('a'), page('a/b', { parent: 'a', file: 'a/b.md' })].map(p => (p.id === 'a' ? { ...p, file: 'a/index.md' } : p))), []);
});
test('each kind of mistake is caught', () => {
  const root = page('start');
  const has = (ps: Page[], re: RegExp) => assert.ok(problems(ps).some(m => re.test(m)), `expected ${re} in ${JSON.stringify(problems(ps))}`);
  has([root, page('a', { file: 'a.md' }), page('a', { file: 'other.md' })], /also used by/);
  has([root, page('a', { file: 'wrong.md' })], /does not match the file path/);
  has([root, page('a', { parent: 'nope' })], /parent "nope" does not exist/);
  has([root, page('a', { parent: undefined })], /No `parent`/);
  has([page('start', { parent: 'x' })], /cannot have a parent/);
  has([root, page('a', { parent: 'a' })], /own parent/);
  has([root, page('a', { parent: 'b' }), page('b', { parent: 'a' })], /loop/);
  has([root, page('a', { sections: { basic: '', deep: 'only deep', advanced: '' } })], /No "## Basic"/);
  has([root, page('a', { sections: { basic: 'see [[ghost]]', deep: '', advanced: '' } })], /\[\[ghost\]\]/);
  has([root, page('a', { related: ['ghost'] })], /`related` points at "ghost"/);
  has([root, page('a', { sections: { basic: '```\nopen', deep: '```', advanced: '' } })], /never closed/);
  has([root, page('a', { sections: { basic: '## Extra\ntext', deep: '', advanced: '' } })], /Use "###"/);
  has([root, page('a', { sections: { basic: '```mermaid\nnot a diagram\n```', deep: '', advanced: '' } })], /mermaid block/);
  has([root, page('a', { title: '' })], /No `title`/);
  has([root, page('a', { summary: '' })], /No `summary`/);
  has([root, page('a', { updated: '11/10/2026' })], /updated/);
  has([root, page('Bad_Id', { file: 'Bad_Id.md' })], /lowercase/);
  has([root, page('', { file: 'x.md' })], /No `id`/);
});

// ── index and trail ──────────────────────────────────────────────────────────
test('index: children in title order, backlinks from links and related, roots', () => {
  const ps = [page('start'), page('b', { title: 'Bee' }), page('a', { title: 'Ant', sections: { basic: 'see [[b]]', deep: '', advanced: '' } }), page('c', { title: 'Cat', related: ['b'] })];
  const idx = buildIndex(ps);
  assert.deepEqual(idx.children.start, ['a', 'b', 'c']); assert.deepEqual(idx.backlinks.b, ['a', 'c']); assert.deepEqual(idx.roots, ['start']);
});
test('trail runs from the top page down and stops on a loop or a broken parent', () => {
  const idx = buildIndex([page('start'), page('a'), page('a/b', { parent: 'a' })]);
  assert.deepEqual(trail(idx, 'a/b').map(p => p.id), ['start', 'a', 'a/b']);
  const loop = buildIndex([page('x', { parent: 'y' }), page('y', { parent: 'x' })]);
  assert.deepEqual(trail(loop, 'x').map(p => p.id), ['y', 'x']);
  assert.deepEqual(trail(idx, 'missing'), []);
});

// ── search ───────────────────────────────────────────────────────────────────
test('search: every word must match; title beats summary beats body; depth limits the body', () => {
  const ps = [
    page('refund', { title: 'Refunds', summary: 'give money back', sections: { basic: 'card declined notes', deep: 'ledger internals', advanced: '' } }),
    page('declined', { title: 'Card declined', summary: 'what to do', sections: { basic: 'try again', deep: '', advanced: '' } }),
    page('misc', { title: 'Misc', summary: 'nothing', sections: { basic: 'cards', deep: '', advanced: '' } }),
  ];
  assert.deepEqual(searchPages(ps, 'card declined').map(r => r.page.id), ['declined', 'refund']);
  assert.deepEqual(searchPages(ps, 'ledger', 'basic'), []); assert.equal(searchPages(ps, 'ledger', 'deep').length, 1);
  assert.deepEqual(searchPages(ps, '   '), []); assert.deepEqual(searchPages(ps, 'zebra'), []);
});

// ── the bundle ───────────────────────────────────────────────────────────────
test('bundle: version is stable for the same content and changes when a page changes; file paths are left out', () => {
  const a = makeBundle([page('start'), page('a')]), b = makeBundle([page('a'), page('start')]);
  assert.equal(a.version, b.version); assert.ok(!('file' in a.pages[0]));
  assert.notEqual(a.version, makeBundle([page('start'), page('a', { lead: 'changed' })]).version);
  assert.equal(contentVersion([]), contentVersion([]));
});
test('readBundle: round trip, and rubbish is refused or cleaned', () => {
  const b = makeBundle([page('start'), page('a', { tags: ['t'] })]);
  assert.deepEqual(readBundle(JSON.parse(JSON.stringify(b))), b);
  for (const bad of [null, 5, 'x', {}, { version: 1, pages: [] }, { version: 'v', pages: [] }, { version: 'v', pages: [{ title: 'no id' }] }]) assert.equal(readBundle(bad), null);
  const cleaned = readBundle({ version: 'v', pages: [{ id: 'a', title: 'A', tags: ['x', 5], sections: { basic: 'b', deep: 7 } }, null, 3] });
  assert.deepEqual(cleaned!.pages[0].tags, ['x']); assert.equal(cleaned!.pages[0].sections.deep, ''); assert.equal(cleaned!.pages.length, 1);
});

// ── the real pages ───────────────────────────────────────────────────────────
test('the pages in help/ have no problems, and every one can be reached from the top page', () => {
  const { pages, issues } = loadPages();
  assert.deepEqual(issues, []); assert.ok(pages.length >= 3);
  const idx = buildIndex(pages);
  for (const p of pages) assert.equal(trail(idx, p.id)[0].id, 'start', `${p.id} does not lead up to "start"`);
  assert.deepEqual(idx.roots, ['start']);
});
test('help/help.json is up to date with the pages (run: npm run help:build)', () => {
  assert.equal(fs.readFileSync(BUNDLE_FILE, 'utf8'), serialise(makeBundle(loadPages().pages)));
});
test('the build skips README.md and files starting with _', () => {
  assert.ok(listPageFiles().every(f => !/readme\.md$/i.test(f) && !f.split('/').pop()!.startsWith('_')));
  assert.ok(listPageFiles().includes('start.md'));
});
test('every real page has all three levels written, or is marked as Basic-only on purpose', () => {
  for (const p of loadPages().pages) assert.ok(depthsPresent(p).includes('basic'), p.id);
});
