// Location: tests/assistantgate.test.ts
// The data gate (patch 0161, plan 3.1): the rules table, the toggles, field maps, unknown fields, free text, tool results, history and the log.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage, Endpoint, FetchLike } from '../src/lib/assistantClient';
import { GATE_TOGGLE_CATEGORIES, defaultAssistant, defaultGateToggles, normaliseAssistant, normaliseToggles, type GateToggles } from '../src/lib/assistantConfig';
import { CATEGORIES, CATEGORY_INFO, FAIL_CLOSED_POLICY, FIXED_NEVER, applyGate, decisionWord, lastFour, resolvePolicy, restricted, type FieldMap, type GatePolicy } from '../src/lib/assistantGate';
import { buildMessagesDetailed, forModel, prepare, readHistory, runPrepared, scrubText, type AskInput, type ChatEntry } from '../src/lib/assistantChat';
import { buildEvent, sumWithheld } from '../src/lib/assistantLog';
import { ASSISTANT_TOOLS, makeToolSet, runToolCall, type AssistantTool } from '../src/lib/assistantTools';
import type { Page } from '../src/lib/helpDocs';

// ---- a pretend data tool, the shape the product and order tools of later patches will have ----
const MAP: FieldMap = {
  orders: {
    id: 'shop', total: 'order', note: 'order',
    items: { name: 'shop', qty: 'shop', cost: 'cost' },
    customer: { name: 'personal', email: 'email', phone: 'personal' },
    tender: { card_number: 'payment', terminal: 'payment' },
    gift_code: 'gift_code', gift_balance: 'gift_balance',
  },
};
const ORDER = {
  id: 'o1', total: 59.5, note: 'Call Jo on 0412 345 678 or jo@example.com, card 4111 1111 1111 1111',
  items: [{ name: 'Tadling', qty: 2, cost: 11.2 }],
  customer: { name: 'Jo Smith', email: 'jo@example.com', phone: '0412 345 678' },
  tender: { card_number: '4111111111111111', terminal: 'T-77' },
  gift_code: 'GC-ABCD-1234-WXYZ', gift_balance: 20,
};
const fixture = () => ({ orders: [JSON.parse(JSON.stringify(ORDER))] });
const LOCAL = resolvePolicy('local'); const REMOTE = resolvePolicy('remote');
const first = (v: any) => v.orders[0];

// ---- the rules table ----
test('Auto on a local endpoint: customer data, emails and balances allowed, codes last four only, payment and secrets never', () => {
  assert.deepEqual(LOCAL, { personal: 'allow', email: 'allow', gift_balance: 'allow', gift_code: 'last4', order: 'allow', cost: 'allow', shop: 'allow', payment: 'deny', secret: 'deny' });
});
test('Auto on a remote endpoint: customer data, emails, balances and codes never sent', () => {
  assert.deepEqual(REMOTE, { personal: 'deny', email: 'deny', gift_balance: 'deny', gift_code: 'deny', order: 'allow', cost: 'allow', shop: 'allow', payment: 'deny', secret: 'deny' });
  assert.deepEqual(FAIL_CLOSED_POLICY, REMOTE, 'with no policy given the remote rules apply');
});
test('every category has a rule, a label and a plain phrase', () => {
  for (const c of CATEGORIES) { assert.ok(CATEGORY_INFO[c].label && CATEGORY_INFO[c].help && CATEGORY_INFO[c].phrase, c); assert.ok(LOCAL[c] && REMOTE[c], c); }
  assert.deepEqual([...GATE_TOGGLE_CATEGORIES, ...FIXED_NEVER].sort(), [...CATEGORIES].sort());
});
test('toggles: Never keeps a category out, Always allow sends it, and the two fixed categories ignore everything', () => {
  const never = resolvePolicy('local', { ...defaultGateToggles(), personal: 'never', shop: 'never' }); assert.equal(never.personal, 'deny'); assert.equal(never.shop, 'deny'); assert.equal(never.email, 'allow');
  const allow = resolvePolicy('remote', { ...defaultGateToggles(), personal: 'allow', email: 'allow', gift_balance: 'allow' }); assert.equal(allow.personal, 'allow'); assert.equal(allow.email, 'allow'); assert.equal(allow.gift_balance, 'allow');
  assert.equal(allow.gift_code, 'deny', 'untouched categories keep their Auto rule');
  for (const scope of ['local', 'remote'] as const) {
    const forced = resolvePolicy(scope, { payment: 'allow', secret: 'allow' } as any); assert.equal(forced.payment, 'deny'); assert.equal(forced.secret, 'deny');
    const all = resolvePolicy(scope, Object.fromEntries(GATE_TOGGLE_CATEGORIES.map(c => [c, 'allow'])) as GateToggles); assert.equal(all.payment, 'deny'); assert.equal(all.secret, 'deny');
  }
});
test('Always allow on gift card codes is the last four characters, never the whole code, on any endpoint', () => {
  assert.equal(resolvePolicy('remote', { gift_code: 'allow' }).gift_code, 'last4'); assert.equal(resolvePolicy('local', { gift_code: 'allow' }).gift_code, 'last4');
  assert.equal(resolvePolicy('local', { gift_code: 'never' }).gift_code, 'deny');
});
test('decisionWord says what the policy does in plain words', () => { assert.equal(decisionWord('allow'), 'Sent'); assert.equal(decisionWord('deny'), 'Not sent'); assert.match(decisionWord('last4'), /last four/i); });
test('lastFour shows four characters at most, and hides a code that short', () => { assert.equal(lastFour('GC-ABCD-1234-WXYZ'), '****WXYZ'); assert.equal(lastFour('1234'), '[hidden]'); assert.equal(lastFour(''), '[hidden]'); });

// ---- applying the gate ----
test('local: customer fields and emails stay, the gift code is cut to four, payment details go, the unknown field is reported', () => {
  const o = fixture(); (o.orders[0] as any).secret_thing = 'x';
  const g = applyGate(o, MAP, LOCAL); const r = first(g.value);
  assert.equal(r.customer.name, 'Jo Smith'); assert.equal(r.customer.email, 'jo@example.com'); assert.equal(r.customer.phone, '0412 345 678');
  assert.equal(r.gift_code, '****WXYZ'); assert.equal(r.gift_balance, 20); assert.equal(r.total, 59.5); assert.equal(r.items[0].cost, 11.2);
  assert.ok(!('tender' in r), 'payment details are never sent'); assert.ok(!('secret_thing' in r));
  assert.deepEqual(g.unknown, ['orders[0].secret_thing']); assert.equal(g.withheld.unknown, 1); assert.equal(g.withheld.payment, 2);
  assert.ok(g.used.includes('personal') && g.used.includes('email') && g.used.includes('gift_code') && !g.used.includes('payment'));
});
test('remote: customer, email, balance and code fields are removed and the model is told something was hidden, not what', () => {
  const g = applyGate(fixture(), MAP, REMOTE); const r = first(g.value);
  assert.ok(!('customer' in r), 'an object with every field hidden is left out whole'); assert.ok(!('gift_code' in r)); assert.ok(!('gift_balance' in r)); assert.ok(!('tender' in r));
  assert.equal(r.total, 59.5); assert.equal(r.items[0].name, 'Tadling'); assert.equal(r.items[0].cost, 11.2);
  const note = (g.value as any).privacy_note as string;
  assert.match(note, /customer details/); assert.match(note, /email addresses/); assert.match(note, /gift card balances/); assert.match(note, /gift card codes/); assert.match(note, /payment details/);
  assert.doesNotMatch(note, /Jo|Smith|0412|WXYZ|4111/);
  assert.ok(!g.used.includes('personal') && !g.used.includes('email'));
  assert.deepEqual(g.unknown, []);
});
test('free text: a remote endpoint gets emails and phone numbers masked out of notes, a local one keeps them, and a card number is masked on both', () => {
  const rem = first(applyGate(fixture(), MAP, REMOTE).value).note as string;
  assert.doesNotMatch(rem, /jo@example\.com|0412|4111/); assert.match(rem, /\[email address\]/); assert.match(rem, /\[phone number\]/); assert.match(rem, /\[card number\]/);
  const loc = first(applyGate(fixture(), MAP, LOCAL).value).note as string;
  assert.match(loc, /jo@example\.com/); assert.match(loc, /0412 345 678/); assert.doesNotMatch(loc, /4111/); assert.match(loc, /\[card number\]/);
});
test('free text follows the toggles: allowing customer details on a remote endpoint keeps phone numbers but not emails, and the other way round', () => {
  const ph = first(applyGate(fixture(), MAP, resolvePolicy('remote', { personal: 'allow' })).value).note as string; assert.match(ph, /0412 345 678/); assert.doesNotMatch(ph, /jo@example/);
  const em = first(applyGate(fixture(), MAP, resolvePolicy('remote', { email: 'allow' })).value).note as string; assert.match(em, /jo@example/); assert.doesNotMatch(em, /0412/);
});
test('keys and tokens in an allowed field are masked on every endpoint, whatever the toggles say', () => {
  const o = fixture(); o.orders[0].note = 'token sk-abcdefgh12345678 and Bearer abcdefghijklmnop';
  for (const p of [LOCAL, REMOTE, resolvePolicy('local', Object.fromEntries(GATE_TOGGLE_CATEGORIES.map(c => [c, 'allow'])) as GateToggles)]) {
    const n = first(applyGate(o, MAP, p).value).note as string; assert.doesNotMatch(n, /sk-abc|abcdefghijklmnop/); assert.match(n, /\[key\]/);
  }
});
test('toggles change the result: Never on orders removes totals, Always allow on customer details brings them to a remote endpoint', () => {
  const noOrders = first(applyGate(fixture(), MAP, resolvePolicy('local', { order: 'never' })).value); assert.ok(!('total' in noOrders)); assert.ok(!('note' in noOrders)); assert.equal(noOrders.id, 'o1');
  const cust = first(applyGate(fixture(), MAP, resolvePolicy('remote', { personal: 'allow', email: 'allow' })).value).customer; assert.equal(cust.name, 'Jo Smith'); assert.equal(cust.email, 'jo@example.com');
});
test('a null value is kept as null, an empty list stays empty, and a hidden category with a null value is still hidden', () => {
  const g = applyGate({ orders: [{ id: 'o2', total: null, items: [], gift_code: null, customer: null }] }, MAP, REMOTE); const r = first(g.value);
  assert.equal(r.total, null); assert.deepEqual(r.items, []); assert.ok(!('gift_code' in r)); assert.ok(r.customer === null || !('customer' in r));
});

// ---- unknown fields ----
test('a field no map names is dropped and reported by name, never by value', () => {
  const g = applyGate({ orders: [{ id: 'o1', loyalty_pin: '9999', customer: { name: 'A', dob: '1990-01-01' } }], extra: { deep: 1 } }, MAP, LOCAL);
  assert.deepEqual([...g.unknown].sort(), ['extra', 'orders[0].customer.dob', 'orders[0].loyalty_pin']);
  assert.doesNotMatch(JSON.stringify(g.value), /9999|1990|deep/); assert.doesNotMatch(JSON.stringify(g.unknown), /9999|1990/);
});
test('an object or list put where the map expects a single value is dropped, so nothing can be tucked inside a lenient field', () => {
  const g = applyGate({ orders: [{ id: { hidden: 'Jo Smith 0412 345 678' }, total: [1, { a: 'b' }] }] }, MAP, LOCAL);
  assert.deepEqual([...g.unknown].sort(), ['orders[0].id', 'orders[0].total']); assert.doesNotMatch(JSON.stringify(g.value), /Jo Smith/);
});
test('a list of plain values is allowed where the map names a category, each value cleaned', () => {
  const g = applyGate({ tags: ['a@b.co', 'x'] }, { tags: 'shop' }, REMOTE); assert.deepEqual((g.value as any).tags, ['[email address]', 'x']);
  const hidden = applyGate({ codes: ['GC-ABCD-1234-WXYZ'] }, { codes: 'gift_code' }, resolvePolicy('local')); assert.deepEqual((hidden.value as any).codes, ['****WXYZ']);
});
test('nesting beyond the limit is dropped and reported, so a deep structure cannot smuggle data past the map', () => {
  const map: FieldMap = {}; let m: FieldMap = map; for (let i = 0; i < 12; i++) { const n: FieldMap = { name: 'shop' }; m.a = n; m = n; }
  let v: any = { name: 'deep' }; for (let i = 0; i < 12; i++) v = { name: 'n', a: v };
  const g = applyGate(v, map, LOCAL); assert.ok(g.unknown.length > 0); assert.doesNotMatch(JSON.stringify(g.value), /deep/);
});
test('the keys the app writes itself (error, note, ok, cut) pass at the top level only, and are still scrubbed', () => {
  const g = applyGate({ error: 'Failed for jo@example.com', note: 'hi', ok: true, orders: [], nested: { note: 'x' } }, MAP, REMOTE);
  assert.equal((g.value as any).error, 'Failed for [email address]'); assert.equal((g.value as any).ok, true); assert.deepEqual(g.unknown, ['nested']);
});
test('a result that is not an object where the map expects one is dropped and reported', () => { assert.deepEqual(applyGate('free text', MAP, LOCAL).unknown, ['']); assert.deepEqual(applyGate({ orders: ['text'] }, MAP, LOCAL).unknown, ['orders[0]']); });

// ---- content tools ----
test("'content' tools keep help text as it is but mask card numbers and keys, and never name a category", () => {
  const g = applyGate({ results: [{ id: 'pay/cash', summary: 'Email help@shop.example, card 4111 1111 1111 1111, key sk-abcdefgh12345678' }], count: 1 }, 'content', REMOTE);
  const t = JSON.stringify(g.value); assert.match(t, /help@shop\.example/); assert.doesNotMatch(t, /4111|sk-abc/); assert.match(t, /\[card number\]/); assert.match(t, /\[key\]/);
  assert.deepEqual(g.used, []); assert.equal(g.withheld.payment, 1); assert.equal(g.withheld.secret, 1); assert.ok(!('privacy_note' in (g.value as object)));
});
test('every tool in this build declares a gate, and only the four help tools are content tools', () => {
  for (const t of ASSISTANT_TOOLS) assert.ok(t.gate === 'content' || (typeof t.gate === 'object' && t.gate !== null), t.def.function.name);
  assert.deepEqual(ASSISTANT_TOOLS.filter(t => t.gate === 'content').map(t => t.def.function.name).sort(), ['read_doc', 'search_docs', 'search_screens', 'show_link'],
    'a new tool that returns shop data needs a field map, not "content". If this tool really returns only help text, add it here.');
});

// ---- the tool runtime ----
const dataTool = (result: unknown, gate: FieldMap = MAP): AssistantTool => ({ gate, def: { type: 'function', function: { name: 'find_orders', description: 'x', parameters: { type: 'object', properties: {} } } }, run: () => result });
const pages: Page[] = [];
const call = (name: string, id = 'c1') => ({ id, type: 'function' as const, function: { name, arguments: '{}' } });
const runData = (policy: GatePolicy | undefined, result: unknown = fixture()) => runToolCall(call('find_orders'), { tools: [dataTool(result)], ctx: { pages, role: 'owner', maxChars: 6000, ...(policy ? { policy } : {}) } });

test('runToolCall: what the model reads has been through the gate, and the record keeps the counts', () => {
  const rem = runData(REMOTE); assert.doesNotMatch(rem.message.content ?? '', /Jo Smith|jo@example|0412|4111|WXYZ|T-77/);
  assert.ok(rem.record.withheld && rem.record.withheld.personal === 2 && rem.record.withheld.email === 1 && rem.record.withheld.payment === 2);
  assert.ok(rem.record.used?.includes('order') && !rem.record.used?.includes('personal'));
  const loc = runData(LOCAL); assert.match(loc.message.content ?? '', /Jo Smith/); assert.match(loc.message.content ?? '', /\*\*\*\*WXYZ/); assert.doesNotMatch(loc.message.content ?? '', /ABCD-1234|4111|T-77/);
});
test('runToolCall: with no policy the strictest rules apply, so a forgotten policy cannot open anything up', () => {
  const r = runData(undefined); assert.doesNotMatch(r.message.content ?? '', /Jo Smith|jo@example|WXYZ/);
});
test('runToolCall: the cut to the size limit happens after the gate, so a long result cannot carry a hidden field in the cut text', () => {
  const big = { orders: Array.from({ length: 200 }, (_, i) => ({ ...JSON.parse(JSON.stringify(ORDER)), id: `o${i}` })) };
  const r = runToolCall(call('find_orders'), { tools: [dataTool(big)], ctx: { pages, role: 'owner', maxChars: 1500, policy: REMOTE } });
  assert.ok((r.message.content ?? '').length <= 1500); assert.doesNotMatch(r.message.content ?? '', /Jo Smith|jo@example|WXYZ/);
});
test('runToolCall: a tool that returns a field its map does not name has it dropped, and the record shows the count', () => {
  const o = fixture(); (o.orders[0] as any).staff_pin = '4321';
  const r = runData(LOCAL, o); assert.doesNotMatch(r.message.content ?? '', /4321|staff_pin/); assert.equal(r.record.withheld?.unknown, 1);
});

// ---- the contract every data tool must meet ----
/** What a later patch's tests call for each data tool: run it on realistic data and fail when it returns a field nobody sorted. */
export function assertNoUnknownFields(tool: AssistantTool, result: unknown) {
  if (tool.gate === 'content') return;
  const g = applyGate(result, tool.gate, LOCAL);
  assert.deepEqual(g.unknown, [], `${tool.def.function.name} returned fields the gate does not know: ${g.unknown.join(', ')}`);
}
test('the contract check passes for a tool whose map covers its result, and fails when the tool returns an extra field', () => {
  assert.doesNotThrow(() => assertNoUnknownFields(dataTool(fixture()), fixture()));
  const leaky = fixture(); (leaky.orders[0] as any).dob = '1990-01-01';
  assert.throws(() => assertNoUnknownFields(dataTool(leaky), leaky), /do(es)? not know: orders\[0\]\.dob/);
});

// ---- history ----
const entry = (i: number, role: 'user' | 'assistant', text: string, used?: ChatEntry['used']): ChatEntry => ({ id: `e${i}`, role, text, at: i, ...(used ? { used } : {}) });
test('restricted: true when a reply used a category the policy no longer sends', () => {
  assert.equal(restricted(['personal'], REMOTE), true); assert.equal(restricted(['personal'], LOCAL), false); assert.equal(restricted(['order', 'shop'], REMOTE), false); assert.equal(restricted(undefined, REMOTE), false); assert.equal(restricted(['mystery'], LOCAL), true);
});
test('history built from customer data is left out when the endpoint is now remote, together with its question, and kept when it is local', () => {
  const h = [entry(1, 'user', 'Who bought the Tadling?'), entry(2, 'assistant', 'Jo Smith bought it.', ['personal', 'order']), entry(3, 'user', 'And the price?'), entry(4, 'assistant', 'It is $59.50.', ['order']), entry(5, 'user', 'Thanks')];
  assert.deepEqual(forModel(h, REMOTE).map(e => e.id), ['e3', 'e4', 'e5']); assert.deepEqual(forModel(h, LOCAL).map(e => e.id), ['e1', 'e2', 'e3', 'e4', 'e5']);
  assert.deepEqual(forModel(h).map(e => e.id), ['e3', 'e4', 'e5'], 'with no policy the strictest rules apply');
  const toggled = resolvePolicy('local', { personal: 'never' }); assert.deepEqual(forModel(h, toggled).map(e => e.id), ['e3', 'e4', 'e5']);
  const tools = makeToolSet({ pages, role: 'owner', contextSize: 8000, policy: REMOTE }); const b = buildMessagesDetailed(h, 'short', 8000, tools);
  assert.doesNotMatch(JSON.stringify(b.messages), /Jo Smith|Tadling/); assert.deepEqual(b.included.map(e => e.id), ['e3', 'e4', 'e5']);
});
test('the entry stays in the stored history for the cashier to read, only the model is not given it', () => {
  const h = [entry(1, 'user', 'q'), entry(2, 'assistant', 'Jo Smith bought it.', ['personal'])]; forModel(h, REMOTE); assert.equal(h.length, 2);
});
test('readHistory keeps the categories a reply used, ignores ones it does not know, and never adds them to a question', () => {
  const r = readHistory([{ id: 'a', role: 'assistant', text: 't', at: 1, used: ['personal', 'nonsense', 'order'] }, { id: 'b', role: 'user', text: 't', at: 2, used: ['personal'] }, { id: 'c', role: 'assistant', text: 't', at: 3, used: 'personal' }]);
  assert.deepEqual(r[0].used, ['personal', 'order']); assert.equal(r[1].used, undefined); assert.equal(r[2].used, undefined);
});

// ---- the loop and the log ----
const ep: Endpoint = { baseUrl: 'http://localhost:11434/v1', model: 'm', timeoutSec: 5 };
function scripted(steps: Array<{ content?: string; calls?: string[] }>) {
  const sent: any[] = []; let i = 0;
  const f: FetchLike = async (_u, init) => {
    sent.push(JSON.parse(init.body ?? '{}')); const s = steps[Math.min(i++, steps.length - 1)];
    const message: any = { role: 'assistant', content: s.content ?? null };
    if (s.calls) message.tool_calls = s.calls.map((n, k) => ({ id: `call_${i}_${k}`, type: 'function', function: { name: n, arguments: '{}' } }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message, finish_reason: s.calls ? 'tool_calls' : 'stop' }] }) };
  };
  return { f, sent };
}
const askWith = (policy: GatePolicy): AskInput => ({ history: [], text: 'Who bought it?', detail: 'short', settings: { contextSize: 8000, temperature: 0.2 }, endpoint: ep, id: (() => { let n = 0; return () => `id${++n}`; })(), now: () => 1000,
  tools: makeToolSet({ pages, role: 'owner', contextSize: 8000, policy, tools: [dataTool(fixture())] }) });
test('the loop: the model never receives what the gate removed, and the reply is marked with the categories it drew on', async () => {
  const { f, sent } = scripted([{ calls: ['find_orders'] }, { content: 'One order, $59.50.' }]);
  const a = askWith(REMOTE); const out = await runPrepared(f, a, prepare(a));
  assert.doesNotMatch(JSON.stringify(sent[1].messages), /Jo Smith|jo@example|0412|4111|WXYZ/);
  assert.deepEqual(out.reply.used, ['order', 'cost', 'shop']);
  const l = scripted([{ calls: ['find_orders'] }, { content: 'Jo Smith.' }]); const b = askWith(LOCAL); const out2 = await runPrepared(l.f, b, prepare(b));
  assert.match(JSON.stringify(l.sent[1].messages), /Jo Smith/); assert.ok(out2.reply.used?.includes('personal') && out2.reply.used?.includes('gift_code'));
});
test('the log line holds what the model was sent and the counts of what the gate withheld, never the withheld values', () => {
  const a = askWith(REMOTE); const r = runToolCall(call('find_orders'), { tools: a.tools!.tools, ctx: a.tools!.ctx });
  const ev = buildEvent({ id: 'x', now: 1, staff: { id: 's', name: 'S', role: 'owner' }, practice: false, detail: 'short', p: prepare(a), known: () => false, ms: 1, tools: [r.record] }).event;
  assert.ok(ev.withheld && ev.withheld.personal === 2 && ev.withheld.email === 1 && ev.withheld.payment === 2); assert.deepEqual(ev.tools?.[0].withheld, ev.withheld);
  assert.doesNotMatch(JSON.stringify(ev), /Jo Smith|jo@example|0412 345|4111|WXYZ|ABCD-1234|T-77/);
  assert.deepEqual(sumWithheld([{ name: 'a', args: '', ok: true, result: '', ms: 0, withheld: { personal: 1 } }, { name: 'b', args: '', ok: true, result: '', ms: 0, withheld: { personal: 2, email: 1 } }]), { personal: 3, email: 1 });
  assert.equal(sumWithheld([]), undefined); assert.equal(sumWithheld(undefined), undefined);
  const plain = buildEvent({ id: 'y', now: 1, staff: { id: 's', name: 'S', role: 'owner' }, practice: false, detail: 'short', p: prepare(a), known: () => false, ms: 1 }).event; assert.ok(!('withheld' in plain));
});

// ---- the settings ----
test('the settings carry one toggle per category, all Auto by default, and old settings with none become Auto', () => {
  const d = defaultAssistant(); assert.deepEqual(d.gate, { personal: 'auto', email: 'auto', gift_balance: 'auto', gift_code: 'auto', order: 'auto', cost: 'auto', shop: 'auto' });
  assert.deepEqual(normaliseAssistant({ baseUrl: 'http://h/v1', model: 'm' }).gate, d.gate);
  assert.deepEqual(normaliseAssistant(undefined), d);
});
test('toggles read back from storage or a backup file are cleaned: unknown categories and values are ignored, payment and secrets cannot be added', () => {
  const t = normaliseToggles({ personal: 'allow', email: 'never', shop: 'sometimes', cost: 5, payment: 'allow', secret: 'allow', mystery: 'allow' });
  assert.deepEqual(t, { personal: 'allow', email: 'never', gift_balance: 'auto', gift_code: 'auto', order: 'auto', cost: 'auto', shop: 'auto' }); assert.ok(!('payment' in t) && !('secret' in t) && !('mystery' in t));
  for (const junk of [null, 'x', 7, [1, 2], undefined]) assert.deepEqual(normaliseToggles(junk), defaultGateToggles());
  assert.deepEqual(normaliseAssistant({ gate: { personal: 'allow' } }).gate.personal, 'allow');
  const copy = normaliseAssistant(defaultAssistant()); copy.gate.personal = 'never'; assert.equal(defaultAssistant().gate.personal, 'auto', 'defaults are never shared');
});
test('the scrubber still lives where the chat code expects it', () => { assert.deepEqual(scrubText('a@b.co').masked, { email: 1 }); assert.equal(scrubText('a@b.co', { email: true }).text, 'a@b.co'); assert.equal(scrubText('0412 345 678', { phone: true }).text, '0412 345 678'); assert.match(scrubText('4111 1111 1111 1111', { email: true, phone: true }).text, /\[card number\]/); });
