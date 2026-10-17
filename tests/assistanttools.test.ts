// Location: tests/assistanttools.test.ts
// The assistant's tools (patch 0157: search_docs and read_doc, the role filter, the tool runner, and the tool loop; the screen tool is in assistantscreens.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage, Endpoint, FetchLike } from '../src/lib/assistantClient';
import { DROPPED_RESULT, buildMessagesDetailed, buildSystemPrompt, fitToContext, runPrepared, prepare, type AskInput } from '../src/lib/assistantChat';
import { askLogged, type LogContext, type LogEvent } from '../src/lib/assistantLog';
import { ASSISTANT_TOOLS, DEFAULT_TOOL_LIMIT, MAX_RESULT_CHARS, docText, makeToolSet, resultCharsFor, runToolCall, searchDocPages, searchTerms, toolDefs, type AssistantTool } from '../src/lib/assistantTools';
import { PAGE_ROLES, pageVisibleTo, parsePage, readBundle, validatePages, makeBundle, type Page } from '../src/lib/helpDocs';
import { builtinHelp } from '../src/lib/helpBuiltin';

// ---- a tiny help set ----
const mk = (id: string, title: string, extra: Partial<Page> = {}): Page => ({ id, title, parent: id === 'start' ? undefined : 'start', summary: `About ${title.toLowerCase()}.`, tags: [], related: [], lead: '', sections: { basic: `Basic text for ${title}.`, deep: '', advanced: '' }, file: `${id}.md`, ...extra });
const pages: Page[] = [
  mk('start', 'Start'),
  mk('pay/cash', 'Taking cash', { tags: ['cash', 'change'], related: ['settings/hardware', 'pay/card'], sections: { basic: 'Tap **Cash**, enter the amount. See [[pay/card|paying by card]] or [[settings/hardware]] or [[settings/hardware|the hardware page]].', deep: 'Rounding is to 5 cents.', advanced: '```mermaid\nflowchart TD\n A-->B\n```\nCode is in `cash.ts`.' } }),
  mk('pay/card', 'Taking a card payment', { tags: ['card', 'refund'] }),
  mk('orders/refunds', 'Refunds', { summary: 'How to refund a card payment or cash sale.', tags: ['refund', 'return'] }),
  mk('settings/hardware', 'Hardware settings', { roles: ['manager', 'owner'], summary: 'Printer and card reader setup.', tags: ['printer', 'reader'] }),
];
const ctxFor = (role: string, over: Partial<{ maxChars: number }> = {}) => ({ pages, role, maxChars: 4000, ...over });
const call = (name: string, args: unknown, id = 'c1') => ({ id, type: 'function' as const, function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const run = (name: string, args: unknown, role = 'cashier') => JSON.parse(runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: ctxFor(role) }).message.content ?? '{}');

// ---- search terms ----
test('search terms drop the little words, keep the useful ones once, and ignore plurals', () => {
  assert.deepEqual(searchTerms('How do I refund a card payment?'), ['refund', 'card', 'payment']);
  assert.deepEqual(searchTerms('refunds REFUND refund'), ['refund']);
  assert.deepEqual(searchTerms('   '), []);
  assert.equal(searchTerms('a '.repeat(20) + 'x1 x2 x3 x4 x5 x6 x7 x8 x9 y1').length, 8, 'at most 8 words');
});

// ---- search_docs ----
test('search_docs finds pages for a whole sentence, best first, with a matching line', () => {
  const r = run('search_docs', { query: 'how do I refund a card payment' });
  const top = r.results.map((x: any) => x.id).slice(0, 2).sort(); assert.deepEqual(top, ['orders/refunds', 'pay/card']);
  assert.ok(!r.results.some((x: any) => x.id === 'pay/cash'), 'a page with none of the key words is left out');
  const refunds = r.results.find((x: any) => x.id === 'orders/refunds'); assert.match(refunds.match, /refund/i);
  assert.doesNotMatch(r.results[0].match, /^Basic Basic/, 'depth headings are not shown in the matching line');
  assert.ok(r.results[0].depths.includes('basic'));
});
test('search_docs: a page needs at least half the words, and nothing found says so', () => {
  assert.equal(run('search_docs', { query: 'quantum teleporter flux' }).results.length, 0);
  assert.match(run('search_docs', { query: 'quantum teleporter flux' }).note, /No help page matched/);
  assert.match(run('search_docs', { query: '' }).error, /Give a query/);
  assert.match(run('search_docs', {}).error, /Give a query/);
});
test('search_docs never returns a page the role may not see, and says nothing about it', () => {
  const asCashier = run('search_docs', { query: 'printer reader', }, 'cashier');
  assert.deepEqual(asCashier.results, []);
  assert.doesNotMatch(JSON.stringify(asCashier), /hardware|printer|manager/i);
  assert.equal(run('search_docs', { query: 'printer reader' }, 'manager').results[0].id, 'settings/hardware');
  assert.equal(run('search_docs', { query: 'printer reader' }, 'owner').results[0].id, 'settings/hardware');
});
test('search_docs returns at most 5 pages', () => {
  const many = Array.from({ length: 12 }, (_, i) => mk(`x/p${i}`, `Widget ${i}`));
  assert.equal(searchDocPages({ pages: many, role: 'owner' }, 'widget').length, 5);
});

// ---- read_doc ----
test('read_doc reads the basic text by default and more with a deeper depth', () => {
  const basic = run('read_doc', { id: 'pay/cash' });
  assert.equal(basic.depth, 'basic'); assert.doesNotMatch(basic.text, /Rounding/);
  assert.match(run('read_doc', { id: 'pay/cash', depth: 'deep' }).text, /Rounding is to 5 cents/);
  assert.equal(run('read_doc', { id: 'pay/cash', depth: 'nonsense' }).depth, 'basic');
  assert.deepEqual(basic.depths_available, ['basic', 'deep', 'advanced']);
});
test('read_doc drops diagrams and turns links into "Title (page id)"', () => {
  const adv = run('read_doc', { id: 'pay/cash', depth: 'advanced' }).text as string;
  assert.doesNotMatch(adv, /mermaid|flowchart/); assert.match(adv, /`cash\.ts`/);
  assert.match(docText(pages[1], 'basic', ctxFor('cashier')), /paying by card \(page pay\/card\)/);
});
test('read_doc: a page the role may not see is answered exactly like a page that does not exist', () => {
  const hidden = run('read_doc', { id: 'settings/hardware' }, 'cashier'); const missing = run('read_doc', { id: 'nope/none' }, 'cashier');
  assert.deepEqual(hidden, missing); assert.match(hidden.error, /no help page with that id/);
  assert.equal(run('read_doc', { id: 'settings/hardware' }, 'manager').title, 'Hardware settings');
  assert.match(run('read_doc', {}, 'owner').error, /no help page/);
});
test('read_doc: links and see_also never name a page the role may not see', () => {
  const asCashier = run('read_doc', { id: 'pay/cash' }, 'cashier');
  assert.doesNotMatch(JSON.stringify(asCashier), /Hardware|settings\/hardware/);
  assert.match(asCashier.text, /the hardware page/, 'the words the author wrote stay, with no page behind them');
  assert.deepEqual(asCashier.see_also, [{ id: 'pay/card', title: 'Taking a card payment' }]);
  assert.match(JSON.stringify(run('read_doc', { id: 'pay/cash' }, 'manager').see_also), /settings\/hardware/);
});
test('read_doc cuts a long page to the limit and says so', () => {
  const long = [mk('start', 'Start'), mk('big', 'Big page', { sections: { basic: 'word '.repeat(2000), deep: '', advanced: '' } })];
  const r = JSON.parse(runToolCall(call('read_doc', { id: 'big' }), { tools: ASSISTANT_TOOLS, ctx: { pages: long, role: 'owner', maxChars: 1500 } }).message.content ?? '{}');
  assert.equal(r.cut, true); assert.match(r.text, /\[cut here/); assert.ok(r.text.length < 1600);
});
test('result limit follows the context size, within bounds', () => {
  assert.equal(resultCharsFor(2000), 1500); assert.equal(resultCharsFor(8000), 4800); assert.equal(resultCharsFor(128000), MAX_RESULT_CHARS);
});

// ---- the runner ----
test('runToolCall never throws: unknown tool, bad arguments, or a tool that fails all come back as errors', () => {
  const set = { tools: ASSISTANT_TOOLS, ctx: ctxFor('owner') };
  const unknown = runToolCall(call('open_the_till', {}), set);
  assert.equal(unknown.record.ok, false); assert.match(unknown.message.content ?? '', /no tool called/);
  for (const bad of ['{not json', '[1,2]', '"text"']) { const r = runToolCall(call('search_docs', bad), set); assert.equal(r.record.ok, false); assert.match(r.message.content ?? '', /not a JSON object/); }
  assert.equal(runToolCall(call('search_docs', ''), set).record.ok, false, 'empty arguments mean no query');
  const boom: AssistantTool = { gate: 'content', def: { type: 'function', function: { name: 'boom', description: 'x', parameters: { type: 'object', properties: {} } } }, run: () => { throw new Error('secret internal detail'); } };
  const r = runToolCall(call('boom', {}), { tools: [boom], ctx: ctxFor('owner') });
  assert.equal(r.record.ok, false); assert.doesNotMatch(r.message.content ?? '', /secret internal/);
});
test('runToolCall answers with a tool message tied to the call, and always valid JSON within the limit', () => {
  const big: AssistantTool = { gate: 'content', def: { type: 'function', function: { name: 'big', description: 'x', parameters: { type: 'object', properties: {} } } }, run: () => ({ text: 'x'.repeat(50000) }) };
  const r = runToolCall(call('big', {}, 'abc'), { tools: [big], ctx: ctxFor('owner', { maxChars: 1000 }) });
  assert.equal(r.message.role, 'tool'); assert.equal(r.message.tool_call_id, 'abc'); assert.equal(r.message.name, 'big');
  assert.ok((r.message.content ?? '').length <= 1000); assert.doesNotThrow(() => JSON.parse(r.message.content ?? ''));
});
test('the record keeps the arguments and result, with any key removed', () => {
  const r = runToolCall(call('search_docs', { query: 'sk-live-ABCDEFGHIJKL1234 refund' }), { tools: ASSISTANT_TOOLS, ctx: ctxFor('owner') }, () => 5, 'sk-live-ABCDEFGHIJKL1234');
  assert.doesNotMatch(r.record.args, /ABCDEFGHIJKL1234/); assert.equal(r.record.name, 'search_docs');
});
test('every tool has a name, a description and object parameters, and none can write', () => {
  const names = toolDefs(ASSISTANT_TOOLS).map(d => d.function.name);
  assert.deepEqual(names, ['search_docs', 'read_doc', 'search_screens', 'show_link', 'show_guide', 'current_time', 'find_products', 'stock_levels', 'sales_report', 'find_orders', 'list_deals', 'find_customers', 'gift_card_activity']);
  for (const d of toolDefs(ASSISTANT_TOOLS)) { assert.ok(d.function.description.length > 20); assert.equal((d.function.parameters as any).type, 'object'); }
});

// ---- the loop ----
const ep: Endpoint = { baseUrl: 'http://localhost:11434/v1', model: 'm', timeoutSec: 5 };
function scripted(steps: Array<{ content?: string | null; calls?: { name: string; args: unknown }[] }>) {
  const sent: any[] = []; let i = 0;
  const f: FetchLike = async (_u, init) => {
    sent.push(JSON.parse(init.body ?? '{}')); const s = steps[Math.min(i++, steps.length - 1)];
    const message: any = { role: 'assistant', content: s.content ?? null };
    if (s.calls) message.tool_calls = s.calls.map((c, k) => ({ id: `call_${i}_${k}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message, finish_reason: s.calls ? 'tool_calls' : 'stop' }] }) };
  };
  return { f, sent };
}
const ask = (over: Partial<AskInput> = {}, role = 'cashier', limit?: number): AskInput => ({ history: [], text: 'How do I refund a card payment?', detail: 'short', settings: { contextSize: 8000, temperature: 0.2 }, endpoint: ep, id: (() => { let n = 0; return () => `id${++n}`; })(), now: () => 1000, tools: makeToolSet({ pages, role, contextSize: 8000, limit }), ...over });

test('the loop: the model searches, reads, then answers; results go back to it and the reply has no dashes', async () => {
  const { f, sent } = scripted([
    { calls: [{ name: 'search_docs', args: { query: 'refund card' } }] },
    { calls: [{ name: 'read_doc', args: { id: 'orders/refunds' } }] },
    { content: 'Open Refunds \u2014 pick the sale.' },
  ]);
  const a = ask(); const out = await runPrepared(f, a, prepare(a));
  assert.equal(out.reply.text, 'Open Refunds, pick the sale.');
  assert.equal(sent.length, 3); assert.equal(sent[0].tools.length, ASSISTANT_TOOLS.length);
  const last: ChatMessage[] = sent[2].messages; const tools = last.filter(m => m.role === 'tool');
  assert.equal(tools.length, 2); assert.match(tools[0].content ?? '', /orders\/refunds/); assert.match(tools[1].content ?? '', /Basic text for Refunds/);
  assert.equal(last.filter(m => m.role === 'assistant' && m.tool_calls).length, 2);
  assert.deepEqual(a.tools!.records.map(r => [r.name, r.ok]), [['search_docs', true], ['read_doc', true]]);
});
test('the loop: a question that needs no tool is just answered', async () => {
  const { f, sent } = scripted([{ content: 'Hello there.' }]); const a = ask({ text: 'hi' });
  assert.equal((await runPrepared(f, a, prepare(a))).reply.text, 'Hello there.'); assert.equal(sent.length, 1); assert.equal(a.tools!.records.length, 0);
});
test('the loop: without tools nothing is offered to the model', async () => {
  const { f, sent } = scripted([{ content: 'Plain.' }]); const a = ask({ tools: undefined });
  await runPrepared(f, a, prepare(a)); assert.equal(sent[0].tools, undefined);
  assert.doesNotMatch(sent[0].messages[0].content, /search_docs/);
});
test('the loop: a role never gets a hidden page back, even when the model asks for it by id', async () => {
  const { f, sent } = scripted([{ calls: [{ name: 'read_doc', args: { id: 'settings/hardware' } }] }, { content: "I couldn't find anything on that." }]);
  const a = ask({}, 'cashier'); await runPrepared(f, a, prepare(a));
  const toolMsg = (sent[1].messages as ChatMessage[]).find(m => m.role === 'tool')!;
  assert.doesNotMatch(toolMsg.content ?? '', /Hardware|printer/i); assert.match(toolMsg.content ?? '', /no help page/);
});
test('the loop stops at the limit, says so, and names the pages it had read', async () => {
  const { f } = scripted([{ calls: [{ name: 'read_doc', args: { id: 'pay/cash' } }] }]); // asks for a tool every time
  const a = ask({}, 'cashier', 3); const out = await runPrepared(f, a, prepare(a));
  assert.match(out.reply.text, /I stopped looking after 3 lookups/); assert.match(out.reply.text, /Taking cash/);
  assert.equal(a.tools!.records.length, 3);
});
test('the loop: an empty final answer is an error, not a blank reply', async () => {
  const { f } = scripted([{ content: '  ' }]); const a = ask(); await assert.rejects(() => runPrepared(f, a, prepare(a)), /empty reply/);
});
test('the default limit is 15', () => assert.equal(DEFAULT_TOOL_LIMIT, 15));

// ---- the prompt and the context ----
test('the prompt with tools tells the model to search, answer from results, and say when nothing is found', () => {
  const p = buildSystemPrompt('short', true);
  assert.match(p, /search_docs/); assert.match(p, /read_doc/); assert.match(p, /couldn't find anything on that/); assert.match(p, /never change anything/i);
  assert.doesNotMatch(buildSystemPrompt('short', false), /search_docs/);
  assert.doesNotMatch(p, /manager|owner|printer|hardware|reports page|staff page/i, 'the prompt never names a restricted thing');
});
test('the tool definitions are counted against the context', () => {
  const hist = Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: 'word '.repeat(60), at: i }));
  const plain = buildMessagesDetailed(hist, 'short', 4000).included.length;
  const withTools = buildMessagesDetailed(hist, 'short', 4000, makeToolSet({ pages, role: 'owner', contextSize: 4000 })).included.length;
  assert.ok(withTools < plain, `${withTools} < ${plain}`);
});
test('fitToContext drops the oldest tool results first and keeps the newest', () => {
  const big = 'y'.repeat(3000);
  const msgs: ChatMessage[] = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'q' },
    { role: 'assistant', content: null, tool_calls: [call('a', {}, '1')] }, { role: 'tool', tool_call_id: '1', content: big },
    { role: 'assistant', content: null, tool_calls: [call('a', {}, '2')] }, { role: 'tool', tool_call_id: '2', content: big }];
  const fitted = fitToContext(msgs, 1500);
  assert.equal(fitted[3].content, DROPPED_RESULT); assert.equal(fitted[5].content, big, 'the newest result is kept');
  assert.equal(msgs[3].content, big, 'the original is not changed');
  assert.deepEqual(fitToContext(msgs, 100000), msgs);
});

// ---- the audit log ----
test('the log records each tool call with its arguments and exact result, and keeps them when the question fails', async () => {
  const events: LogEvent[] = [];
  const c: LogContext = { staff: { id: 's1', name: 'Casey', role: 'cashier' }, practice: false, apiKey: 'sk-test-SECRETSECRET1234', known: () => false, sink: async e => { events.push(e); }, newId: () => 'e1' };
  const ok = scripted([{ calls: [{ name: 'search_docs', args: { query: 'refund' } }] }, { content: 'Done.' }]);
  const r = await askLogged(ok.f, ask(), c); assert.ok(r.ok);
  assert.equal(events[0].tools?.length, 1); assert.equal(events[0].tools![0].name, 'search_docs'); assert.match(events[0].tools![0].result, /orders\/refunds/);
  const bad = scripted([{ calls: [{ name: 'read_doc', args: { id: 'pay/cash' } }] }, { content: '' }]);
  const r2 = await askLogged(bad.f, ask(), c); assert.equal(r2.ok, false);
  assert.equal(events[1].kind, 'error'); assert.equal(events[1].tools?.length, 1);
  const none = await askLogged(scripted([{ content: 'Hi.' }]).f, ask({ tools: undefined }), c); assert.ok(none.ok);
  assert.equal(events[2].tools, undefined);
});

// ---- roles on help pages ----
test('a roles header is read, checked and kept through the bundle', () => {
  const raw = '---\nid: settings/x\ntitle: X\nparent: start\nsummary: s\ntags: [a]\nroles: [manager, owner]\n---\n## Basic\n\ntext\n';
  const parsed = parsePage('settings/x.md', raw) as { page: Page }; assert.deepEqual(parsed.page.roles, ['manager', 'owner']);
  assert.deepEqual(readBundle(makeBundle([parsed.page]))!.pages[0].roles, ['manager', 'owner']);
  const bad = { ...parsed.page, roles: ['boss'] };
  assert.ok(validatePages([mk('start', 'Start'), { ...bad, parent: 'start' } as Page]).some(i => /roles/.test(i.problem)));
  assert.deepEqual([...PAGE_ROLES], ['cashier', 'manager', 'owner']);
  assert.equal(pageVisibleTo({}, 'cashier'), true); assert.equal(pageVisibleTo({ roles: [] }, 'cashier'), true); assert.equal(pageVisibleTo({ roles: ['manager'] }, 'cashier'), false);
});
test('the real help: a cashier cannot see Settings, Staff or Reports pages, and can see the everyday ones', () => {
  const all = builtinHelp().pages; const seen = (role: string) => new Set(all.filter(p => pageVisibleTo(p, role)).map(p => p.id));
  const cashier = seen('cashier'), manager = seen('manager');
  for (const id of ['settings', 'settings/assistant', 'settings/shopify', 'staff', 'orders/reports']) { assert.ok(!cashier.has(id), `${id} hidden from cashier`); assert.ok(manager.has(id), `${id} shown to manager`); }
  for (const id of ['start', 'pay/cash', 'orders/refunds', 'sales/cart-warnings']) assert.ok(cashier.has(id), `${id} shown to cashier`);
  const hits = searchDocPages({ pages: all, role: 'cashier' }, 'settings assistant model address', 10).map(h => h.id);
  assert.ok(!hits.some(id => id.startsWith('settings/') && id !== 'settings/ask-assistant'), hits.join(','));
  assert.ok(cashier.has('settings/ask-assistant'), 'the page about using the chat is for everyone');
  assert.ok(searchDocPages({ pages: all, role: 'owner' }, 'refund card payment')[0], 'the real help is searchable');
});
