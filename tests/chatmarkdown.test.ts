// Location: tests/chatmarkdown.test.ts
// How the assistant's replies are read as Markdown for the chat (patch 0165): the tidying, the blocks, and that no link is ever tappable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chatBlocks, tidyMarkdown, unlink } from '../src/lib/chatMarkdown';
import { inlineText, parseInline, type Block } from '../src/lib/mdBlocks';

const kinds = (bs: Block[]) => bs.map(b => b.k);
const allInline = (bs: Block[]) => bs.flatMap(b => (b.k === 'heading' || b.k === 'para' ? b.inline : b.k === 'list' ? b.items.flatMap(function f(i: any): any[] { return [...i.inline, ...i.children.flatMap(f)]; }) : b.k === 'table' ? [...b.head.flat(), ...b.rows.flat(2)] : []));

test('a single # heading and the deeper ones are read as headings', () => {
  const b = chatBlocks('# Refunds\n\n##### Small print\n\nText.');
  assert.deepEqual(kinds(b), ['heading', 'heading', 'para']);
  assert.equal((b[0] as any).level, 2); assert.equal((b[1] as any).level, 4);
});
test('__bold__, _italic_ and ~~strike~~ are tidied, and snake_case words and sums are left alone', () => {
  const t = tidyMarkdown('This is __bold__ and _slanted_ and ~~gone~~. Use sales_report for 2 * 3 * 4 and my_var_name.');
  assert.equal(t, 'This is **bold** and *slanted* and gone. Use sales_report for 2 * 3 * 4 and my_var_name.');
  const xs = parseInline(t); assert.ok(xs.some(x => x.t === 'bold' && x.s === 'bold')); assert.ok(xs.some(x => x.t === 'italic' && x.s === 'slanted'));
});
test('quotes show as text, and rules are dropped', () => {
  const b = chatBlocks('> Take the card first.\n\n---\n\nThen the cash.');
  assert.deepEqual(kinds(b), ['para', 'para']); assert.equal(inlineText((b[0] as any).inline), 'Take the card first.');
});
test('lists, numbered lists and tables come through', () => {
  const b = chatBlocks('Steps:\n\n1. Tap **Cart**\n2. Tap Charge\n\n* one\n  * nested\n\n| Item | Stock |\n|---|---:|\n| Cow | 5 |');
  assert.deepEqual(kinds(b), ['para', 'list', 'list', 'table']);
  assert.equal((b[1] as any).ordered, true); assert.equal((b[2] as any).items[0].children.length, 1); assert.equal((b[3] as any).rows[0].length, 2);
});
test('nothing inside a code fence is tidied, and an unclosed fence still ends', () => {
  const t = tidyMarkdown('```\n# not a heading\n__x__\n---\n```\n\n# Real');
  assert.equal(t, '```\n# not a heading\n__x__\n---\n```\n\n## Real');
  assert.deepEqual(kinds(chatBlocks('```\nopen ended\n# x')), ['code']);
});
test('a diagram is shown as code, never drawn', () => {
  const b = chatBlocks('```mermaid\nflowchart TD\n A-->B\n```'); assert.deepEqual(kinds(b), ['code']); assert.equal((b[0] as any).lang, 'mermaid');
});
test('no link is ever tappable: the words stay and the address goes, in every kind of block', () => {
  const b = chatBlocks('See [Reports](#/sales/reports) or [here](https://evil.example/pay).\n\n- [Item](#/stock)\n\n## [Head](https://x.example)\n\n| a |\n|---|\n| [cell](#/p) |');
  const xs = allInline(b); assert.ok(xs.length > 4);
  assert.ok(xs.every((x: any) => x.t !== 'page' && x.t !== 'url'));
  assert.match(xs.map((x: any) => x.s).join(' '), /Reports/); assert.doesNotMatch(JSON.stringify(b), /evil\.example|#\/|https/);
  assert.deepEqual(unlink(parseInline('[a](#/b)')), [{ t: 'text', s: 'a' }]);
});
test('plain text, empty text and odd input never throw', () => {
  assert.deepEqual(kinds(chatBlocks('Just words.')), ['para']); assert.deepEqual(chatBlocks(''), []); assert.deepEqual(chatBlocks(undefined as any), []);
  assert.doesNotThrow(() => chatBlocks('**unclosed *and ` weird | pipes\n|\n#\n- \n> '));
});
