// Location: tests/assistantnarrow.test.ts
// Patch 0185: only the tools a question is likely to need are sent to the model, and the rest can be asked for with more_tools.
// It never gives anyone a tool their role does not have, and a set that is not narrowed behaves exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Endpoint, FetchLike } from '../src/lib/assistantClient';
import { buildMessagesDetailed, buildSystemPrompt, estimateTokens, prepare, REPLY_SHARE, runPrepared, type AskInput } from '../src/lib/assistantChat';
import { DEFAULT_CONTEXT_SIZE } from '../src/lib/assistantConfig';
import { ASSISTANT_TOOLS, makeToolSet, offeredTools, runToolCall, toolDefs, toolsFor, type AssistantTool } from '../src/lib/assistantTools';
import { MORE_TOOLS, TOOL_GROUPS, narrow, recentAsks, wantedGroups } from '../src/lib/assistantToolGroups';

const names = (set: Parameters<typeof offeredTools>[0]) => offeredTools(set).map(t => t.def.function.name);
const mk = (role: string, ...asks: string[]) => makeToolSet({ pages: [], role, contextSize: DEFAULT_CONTEXT_SIZE, narrow: asks });
const call = (name: string, args: unknown) => ({ id: 'c1', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
const json = (set: ReturnType<typeof mk>, name: string, args: unknown) => JSON.parse(runToolCall(call(name, args), set).message.content ?? '{}');

test('every tool is in exactly one group, so none can go missing', () => {
  const all = Object.values(TOOL_GROUPS).flat();
  assert.equal(new Set(all).size, all.length, 'no tool is in two groups');
  assert.deepEqual([...all].sort(), ASSISTANT_TOOLS.map(t => t.def.function.name).sort(), 'the groups name every tool and nothing else');
});

test('the words: a where-is question wants only help, and figures, cash and status questions want their group', () => {
  assert.deepEqual(wantedGroups(['Where do I find the reports page?']), []);
  assert.deepEqual(wantedGroups(['How do I add a staff member']), []);
  assert.ok(wantedGroups(['How many Bumble Bees do we have?']).includes('shop'));
  assert.ok(wantedGroups(['What is low on stock?']).includes('shop'));
  assert.ok(wantedGroups(['How did we do yesterday?']).includes('shop'));
  assert.ok(wantedGroups(['What should be in the drawer?']).includes('cash'));
  assert.ok(wantedGroups(['Why won\'t this sale go through?']).includes('cash'));
  assert.ok(wantedGroups(['Is the till syncing?']).includes('status'));
  assert.ok(wantedGroups(['The card reader is not working']).includes('status'));
  assert.deepEqual(wantedGroups(['How many in the drawer and is it syncing today?']).sort(), ['cash', 'shop', 'status']);
});

test('recentAsks keeps the newest few things the person typed, so a follow up keeps its tools', () => {
  const h = [{ role: 'user', text: 'one' }, { role: 'assistant', text: 'a1' }, { role: 'user', text: 'two' }, { role: 'assistant', text: 'a2' }, { role: 'user', text: 'three' }];
  assert.deepEqual(recentAsks(h, 'four'), ['two', 'three', 'four']);
  assert.deepEqual(recentAsks([], 'only'), ['only']);
  const stock = mk('cashier', ...recentAsks([{ role: 'user', text: 'What is low on stock?' }, { role: 'assistant', text: 'These are low.' }], 'and the cow plush?'));
  assert.ok(names(stock).includes('find_products'), 'the follow up keeps the shop tools the chat already asked for');
});

test('a help question is sent the help tools and more_tools, and the definitions are far smaller', () => {
  const set = mk('cashier', 'Where do I find the reports page?');
  assert.deepEqual(names(set).sort(), [...TOOL_GROUPS.help, MORE_TOOLS].sort());
  const all = makeToolSet({ pages: [], role: 'cashier', contextSize: DEFAULT_CONTEXT_SIZE });
  assert.equal(all.offered, undefined, 'a set that is not narrowed has no offered list');
  assert.equal(offeredTools(all).length, toolsFor('cashier').length, 'and sends every tool, as before');
  const small = estimateTokens(JSON.stringify(toolDefs(offeredTools(set)))); const big = estimateTokens(JSON.stringify(toolDefs(offeredTools(all))));
  assert.ok(small < big * 0.55, `narrowed ${small} against ${big}`);
  const more = offeredTools(set).find(t => t.def.function.name === MORE_TOOLS)!;
  assert.deepEqual((more.def.function.parameters as any).properties.group.enum, ['shop', 'cash', 'status']);
});

test('a question that asks for a group gets it, and when every group is asked for there is no more_tools', () => {
  assert.ok(TOOL_GROUPS.shop.every(n => names(mk('cashier', 'How many Bumble Bees do we have?')).includes(n)));
  const cash = names(mk('cashier', 'What should be in the drawer?'));
  assert.ok(TOOL_GROUPS.cash.every(n => cash.includes(n)) && !cash.includes('find_products'));
  const everything = mk('manager', 'How many in the drawer and is it syncing today?');
  assert.equal(names(everything).length, toolsFor('manager').length);
  assert.ok(!names(everything).includes(MORE_TOOLS));
  assert.equal(everything.tools.length, toolsFor('manager').length, 'nothing extra was added to the set');
});

test('roles: nobody gets a tool through the groups or more_tools that their role does not have', () => {
  // A cashier asking about settings is given app_status and never read_settings.
  const cashier = mk('cashier', 'Is the till syncing? What are the settings?');
  assert.ok(names(cashier).includes('app_status')); assert.ok(!names(cashier).includes('read_settings'));
  const manager = mk('manager', 'What are the settings?'); assert.ok(names(manager).includes('read_settings'));
  // And asking for the status group by hand loads only what the cashier may have.
  const c2 = mk('cashier', 'Where is the reports page?');
  const r = json(c2, MORE_TOOLS, { group: 'status' });
  assert.deepEqual(r.loaded, ['app_status']);
  assert.ok(!names(c2).includes('read_settings'));
  // The set's own list never held it, so a call for it fails the way an unknown tool does.
  assert.match(json(c2, 'read_settings', {}).error, /no tool called/);
});

test('more_tools loads a group for the rest of the question, refuses a made-up group, and says when it is already loaded', () => {
  const set = mk('cashier', 'Where is the reports page?');
  assert.ok(!names(set).includes('find_products'));
  const r = json(set, MORE_TOOLS, { group: 'shop' });
  assert.equal(r.ok, true); assert.ok(r.loaded.includes('find_products') && r.loaded.includes('current_time'));
  assert.ok(names(set).includes('stock_levels'), 'the offered list now has it');
  assert.match(json(set, MORE_TOOLS, { group: 'shop' }).note, /already loaded/);
  assert.match(json(set, MORE_TOOLS, { group: 'secrets' }).error, /no group called/);
  assert.match(json(set, MORE_TOOLS, {}).error, /no group called/);
  // More_tools is read only: it changes the list of names and nothing else.
  assert.equal(set.ctx.role, 'cashier');
});

test('a tool the groups do not name is always sent, and a tool the model calls without being sent it still runs', () => {
  const extra: AssistantTool = { gate: 'content', def: { type: 'function', function: { name: 'later_tool', description: 'A tool added in a later patch and not put in a group.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }, run: () => ({ ok: true }) };
  const set = makeToolSet({ pages: [], role: 'cashier', contextSize: DEFAULT_CONTEXT_SIZE, tools: [...ASSISTANT_TOOLS, extra], narrow: ['Where is the reports page?'] });
  assert.ok(names(set).includes('later_tool'));
  assert.ok(!names(set).includes('stock_levels'));
  assert.notEqual(json(set, 'stock_levels', {}).error ?? '', 'There is no tool called "stock_levels".', 'a role-permitted tool is found even when it was not sent');
});

test('narrow never offers a name that is not in the allowed list', () => {
  const allowed = toolsFor('cashier'); const n = narrow(allowed, ['How many? Is it syncing? Cash in the drawer?']);
  const have = new Set(allowed.map(t => t.def.function.name));
  for (const o of n.offered) assert.ok(have.has(o) || o === MORE_TOOLS, o);
});

test('the prompt only talks about the tools that are sent, and says how to get the rest', () => {
  const help = buildSystemPrompt('short', true, names(mk('cashier', 'Where is the reports page?')));
  assert.match(help, /more_tools/); assert.match(help, /search_docs/);
  assert.doesNotMatch(help, /never count stock yourself/); assert.doesNotMatch(help, /never do them yourself/); assert.doesNotMatch(help, /privacy rules/); assert.doesNotMatch(help, /current_time/);
  assert.match(help, /never tell them to tap a tab that it does not list/i);
  assert.match(help, /cannot see what is left on a gift card/);
  const shop = buildSystemPrompt('short', true, names(mk('cashier', 'How many Bumble Bees do we have?')));
  assert.match(shop, /never count stock yourself/i); assert.match(shop, /privacy rules/); assert.match(shop, /never guess the date/i); assert.doesNotMatch(shop, /never do them yourself/);
  const full = buildSystemPrompt('short', true, toolsFor('manager').map(t => t.def.function.name));
  assert.doesNotMatch(full, /more_tools/); assert.match(full, /nineteen tools/);
  assert.ok(estimateTokens(help) < estimateTokens(full) * 0.75, 'and it is shorter');
});

test('at the default context a help question leaves much more room for the chat than before', () => {
  const room = (role: string, ...asks: string[]) => {
    const set = mk(role, ...asks);
    const b = buildMessagesDetailed([{ id: 'u', role: 'user', text: asks[asks.length - 1], at: 1 }], 'short', DEFAULT_CONTEXT_SIZE, set);
    return Math.floor(DEFAULT_CONTEXT_SIZE * (1 - REPLY_SHARE)) - estimateTokens(b.system) - estimateTokens(JSON.stringify(toolDefs(offeredTools(set))));
  };
  // Measured at 8000: help only 3,994 (it was 1,331 for a cashier and 1,088 for a manager), cash 3,491, shop 1,797, every group 1,318 and 1,074.
  assert.ok(room('cashier', 'Where is the reports page?') >= 3500, `${room('cashier', 'Where is the reports page?')}`);
  assert.ok(room('manager', 'Where is the reports page?') >= 3500);
  assert.ok(room('cashier', 'What should be in the drawer?') >= 3000, 'cash questions are cheap too');
  assert.ok(room('cashier', 'How many Bumble Bees do we have?') >= 1500, 'the shop tools are the heavy group');
  assert.ok(room('manager', 'How many in the drawer and is it syncing today?') >= 1000, 'with every group asked for it is the same as before, and still above the budget test floor');
});

// ---- the loop, with a scripted model ----
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
const askFor = (text: string, history: AskInput['history'] = []): AskInput => ({ history, text, detail: 'short', settings: { contextSize: DEFAULT_CONTEXT_SIZE, temperature: 0.2 }, endpoint: ep, id: (() => { let n = 0; return () => `id${++n}`; })(), now: () => 1000,
  tools: mk('cashier', ...recentAsks(history, text)) });

test('the loop: the first request leaves the shop tools out, the model asks for them, and the next request has them', async () => {
  const { f, sent } = scripted([
    { calls: [{ name: MORE_TOOLS, args: { group: 'shop' } }] },
    { calls: [{ name: 'stock_levels', args: {} }] },
    { content: 'Nothing is low.' },
  ]);
  const a = askFor('Where is the reports page?'); // the words miss on purpose: the model has to ask
  const out = await runPrepared(f, a, prepare(a));
  assert.equal(out.reply.text, 'Nothing is low.');
  const sentNames = (i: number) => (sent[i].tools as any[]).map(t => t.function.name);
  assert.ok(!sentNames(0).includes('stock_levels') && sentNames(0).includes(MORE_TOOLS) && sentNames(0).includes('search_docs'));
  assert.ok(sentNames(1).includes('stock_levels') && sentNames(1).includes('find_products'), 'after more_tools the shop tools are sent');
  assert.deepEqual(a.tools!.records.map(r => [r.name, r.ok]).slice(0, 1), [[MORE_TOOLS, true]]);
  assert.ok(sent[1].messages.some((m: any) => m.role === 'tool' && /loaded/.test(m.content)), 'the model is told what it got');
});

test('the loop: a question that names the shop sends the shop tools straight away, with no more_tools needed', async () => {
  const { f, sent } = scripted([{ content: 'None left.' }]);
  const a = askFor('How many Bumble Bees do we have?'); await runPrepared(f, a, prepare(a));
  const n = (sent[0].tools as any[]).map(t => t.function.name);
  assert.ok(n.includes('find_products') && n.includes('stock_levels') && !n.includes('cash_drawer'));
});

test('the system prompt in the request matches the tools in the request', async () => {
  const { f, sent } = scripted([{ content: 'ok' }]);
  const a = askFor('Is the till syncing?'); await runPrepared(f, a, prepare(a));
  const sys: string = sent[0].messages[0].content; const n = (sent[0].tools as any[]).map(t => t.function.name);
  assert.ok(n.includes('app_status')); assert.match(sys, /app_status/); assert.match(sys, /more_tools/);
  assert.doesNotMatch(sys, /never count stock yourself/i);
});
