// Location: tests/assistantstatus.test.ts
// The assistant's settings reader and app status tools (patch 0169): what they say, that no secret or name can get into them,
// that the settings reader is only there for a role that may open Settings, that every field is in a field map, and that they are read only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, resolvePolicy } from '../src/lib/assistantGate';
import { defaultAssistant } from '../src/lib/assistantConfig';
import { ASSISTANT_TOOLS, makeToolSet, runToolCall, toolDefs, toolsFor } from '../src/lib/assistantTools';
import { buildSystemPrompt } from '../src/lib/assistantChat';
import { SETTINGS_SECTIONS, appStatusTool, buildSettingsView, buildStatusView, readSettingsTool, safeLine, settingsReply, whenText, type SettingsIn, type StatusIn, type TillState } from '../src/lib/assistantStatus';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 10, 18, 15, 5).getTime();

// ---- a settings object with a secret or a name in every place one could hide ----
const SECRET_URL = 'https://hooks.example.com/pass-server/sk-live-ABCDEFGH12345678';
const settings = (over: Partial<SettingsIn> = {}): SettingsIn => ({
  shopName: 'Aiden\'s 3D Prints', locationName: 'Main shop', registerName: 'Register 1', cashRounding: true, smartChange: false, consolidate: true,
  fees: { cardPresentRate: 0.014, keyedRate: 0.017, refundReturnsFee: false }, theme: 'brand', tileSize: 124, glassSurfaces: false, itemSpotlight: { name: true, image: false },
  staff: [
    { id: 'a', name: 'Priya Sharma', role: 'owner', salt: 's', pinHash: 'PINHASH-1234', badgeSalt: 'b', badgeHash: 'BADGEHASH-9876' },
    { id: 'b', name: 'Tom Nguyen', role: 'manager', salt: 's', pinHash: 'PINHASH-5555' },
    { id: 'c', name: 'Casey Lee', role: 'cashier', salt: 's', pinHash: 'PINHASH-7777' },
    { id: 'd', name: 'Jo Park', role: 'cashier', salt: 's', pinHash: 'PINHASH-8888' },
  ] as any,
  requirePin: true, passServerUrl: SECRET_URL, giftClaimUrl: 'https://claim.example.com/gift?token=abc', autoReceipt: 'ask',
  receipt: { serverUrl: 'https://receipts.example.com/r?key=zzz', name: 'Aiden\'s 3D Prints', abn: '12345678901', address: '1 Maker St', phone: '0412 345 678', email: 'shop@example.com', website: 'https://aidens3dp.com', returnPolicy: 'Seven days.', gstRegistered: false },
  bundlesJson: '{"version":1}', helpDepth: 'basic', adjustPerms: { cashier: { line: false, order: false }, manager: { item: false } },
  screensaver: { enabled: true, idleMinutes: 5, showWhenLoggedOut: true, lockedSeconds: 15, keepAwake: true, bgColor: '#13111C', logoUrl: 'https://cdn.example.com/logo.png?sig=SECRETSIG', logoFile: '/private/logo.png', drift: true, showClock: false },
  cartWarnings: [{ id: '1', enabled: true }, { id: '2', enabled: false }] as any, scannerCal: { speeds: {} } as any,
  assistant: { ...defaultAssistant(), baseUrl: 'http://192.168.1.20:11434/v1', model: 'llama3.1:8b' },
  ...over,
});
const EXTRA = { shopifyConnected: true, shopifyStore: 'aidens3dp.myshopify.com', bundleDeals: 2, automaticDiscounts: 3, canSeeAssistant: true };
const view = (over: Partial<SettingsIn> = {}, extra = {}) => buildSettingsView(settings(over), { ...EXTRA, ...extra });
const NEVER_IN_A_VIEW = ['Priya', 'Sharma', 'Tom Nguyen', 'Casey', 'Jo Park', 'PINHASH', 'BADGEHASH', 'hooks.example.com', 'sk-live', 'claim.example.com', 'receipts.example.com', '12345678901', '1 Maker St', '0412', 'shop@example.com', 'aidens3dp.com/', 'cdn.example.com', 'SECRETSIG', '/private/logo', '192.168.1.20', 'token=abc'];

// ---- the settings view ----
test('the settings view says what is on and off, in plain words and numbers', () => {
  const v: any = view();
  assert.deepEqual(v.register, { name: 'Register 1', shop_name: 'Aiden\'s 3D Prints', location: 'Main shop' });
  assert.deepEqual(v.shopify, { connected: true, store: 'aidens3dp.myshopify.com' });
  assert.deepEqual(v.checkout, { cash_rounding: true, smart_change: false, consolidate_identical_items: true, auto_receipt: 'asks at each sale' });
  assert.deepEqual(v.card_fees, { card_present: '1.4%', keyed: '1.7%', refund_returns_fee: false });
  assert.deepEqual(v.receipts, { page_set_up: true, business_name_set: true, abn_set: true, gst_registered: false, return_policy_set: true });
  assert.deepEqual(v.links, { gift_card_claim_page_set: true, pass_server_set: true });
  assert.deepEqual(v.staff, { pin_required: true, owners: 1, managers: 1, cashiers: 2 });
  assert.deepEqual(v.cart_warnings, { total: 2, switched_on: 1 }); assert.deepEqual(v.discounts, { bundle_deals: 2, automatic_discounts: 3 });
  assert.equal(v.display.tile_size, '124 points'); assert.equal(v.display.item_spotlight_name, true); assert.equal(v.screensaver.after_minutes, 5); assert.equal(v.scanner_calibrated, true);
});
test('which roles may not change prices is listed in words, and an open setup says so', () => {
  assert.deepEqual((view() as any).price_adjustment_limits, ['Cashiers cannot set line prices', 'Cashiers cannot set whole order prices', 'Managers cannot set item prices']);
  assert.deepEqual((view({ adjustPerms: {} }) as any).price_adjustment_limits, ['None: every role may set price adjustments']);
  assert.deepEqual((view({ adjustPerms: 'rubbish' as any }) as any).price_adjustment_limits, ['None: every role may set price adjustments'], 'stored junk reads as open');
});
test('nothing secret, no staff name, no web address and no contact detail is anywhere in the view, even stringified', () => {
  const all = JSON.stringify(view());
  for (const bad of NEVER_IN_A_VIEW) assert.ok(!all.includes(bad), `"${bad}" must not be in the settings view`);
  const noAssistant = JSON.stringify(view({}, { canSeeAssistant: false }));
  for (const bad of NEVER_IN_A_VIEW) assert.ok(!noAssistant.includes(bad));
});
test('an unset address is reported as not set, and a disconnected shop has no store name', () => {
  const v: any = view({ passServerUrl: '', giftClaimUrl: '  ', receipt: { ...settings().receipt, serverUrl: '', abn: '', name: '', returnPolicy: '' } }, { shopifyConnected: false, shopifyStore: 'aidens3dp.myshopify.com' });
  assert.deepEqual(v.links, { gift_card_claim_page_set: false, pass_server_set: false }); assert.equal(v.receipts.page_set_up, false); assert.equal(v.receipts.abn_set, false);
  assert.deepEqual(v.shopify, { connected: false });
});
test('the assistant group is only there when this person may see it, and it holds no address or key', () => {
  assert.equal((view({}, { canSeeAssistant: false }) as any).assistant, undefined);
  const a: any = (view() as any).assistant;
  assert.deepEqual({ set_up: a.set_up, model: a.model, endpoint: a.endpoint, endpoint_setting: a.endpoint_setting }, { set_up: true, model: 'llama3.1:8b', endpoint: 'local', endpoint_setting: 'auto' });
  assert.equal(a.context_size, 8000); assert.equal(a.tool_call_limit, 15); assert.equal(a.timeout_seconds, 120); assert.equal(a.log_cap_mb, 200);
  assert.deepEqual(Object.keys(a.privacy).sort(), ['costs_and_profit', 'customer_details', 'email_addresses', 'gift_card_balances', 'gift_card_codes', 'order_details', 'shop_data']);
  assert.ok(Object.values(a.privacy).every(x => x === 'Auto'));
  const never: any = (view({ assistant: { ...defaultAssistant(), baseUrl: 'https://api.example.com/v1', model: 'm', gate: { ...defaultAssistant().gate, personal: 'never', gift_code: 'allow' } } }) as any).assistant;
  assert.equal(never.endpoint, 'remote'); assert.equal(never.privacy.customer_details, 'Never allow'); assert.equal(never.privacy.gift_card_codes, 'Always allow');
  const blank: any = (view({ assistant: defaultAssistant() }) as any).assistant; assert.equal(blank.set_up, false); assert.equal(blank.endpoint, 'none'); assert.equal(blank.model, 'none');
  assert.equal((view({ assistant: { ...defaultAssistant(), baseUrl: 'http://192.168.1.5:11434/v1', model: 'x', endpointMode: 'remote' } }) as any).assistant.endpoint, 'remote', 'a forced remote address is reported remote');
});
test('read_settings groups: one group, all of them, an unknown name, and the assistant group is never asked for by name', () => {
  const v = view(); const all: any = settingsReply(v, undefined); assert.ok(all.register && all.staff && all.assistant && all.note);
  assert.deepEqual(Object.keys(settingsReply(v, 'all')).sort(), Object.keys(all).sort());
  const staff: any = settingsReply(v, 'staff'); assert.deepEqual(Object.keys(staff).sort(), ['note', 'price_adjustment_limits', 'staff']);
  assert.equal(staff.assistant, undefined);
  assert.deepEqual(Object.keys(settingsReply(v, 'Receipts')).sort(), ['links', 'note', 'receipts']);
  const bad: any = settingsReply(v, 'assistant'); assert.match(bad.error, /no settings group/); assert.ok(!SETTINGS_SECTIONS.includes('assistant' as any));
  assert.match((settingsReply(v, 'x'.repeat(500)) as any).error, /^There is no settings group called "x{39}…"/);
  const keysInGroups = SETTINGS_SECTIONS.flatMap(s => Object.keys(settingsReply(v, s)).filter(k => k !== 'note'));
  for (const k of Object.keys(v)) if (k !== 'assistant') assert.ok(keysInGroups.includes(k), `${k} is in a group`);
});

// ---- the status view ----
const status = (over: Partial<StatusIn> = {}): StatusIn => ({
  now: NOW, version: '1.0.0', build: '42', registerName: 'Register 1', sync: { state: 'idle', at: at(2026, 10, 18, 14, 55).toISOString() }, zeller: { ready: true },
  outbox: [], notices: [], shopifyConnected: true, receiptPageSet: true, catalogueAt: at(2026, 10, 18, 9, 0).toISOString(), stockSince: at(2026, 10, 17, 18, 30).toISOString(), variationCount: 312, ...over,
});
test('a healthy till: version, sync time and how long ago, no queue, reader ready', () => {
  const v: any = buildStatusView(status());
  assert.deepEqual(v.app, { version: '1.0.0', build: '42', register: 'Register 1' });
  assert.deepEqual(v.sync, { state: 'idle', last_sync: '2026-10-18 2:55 pm', minutes_since_last_sync: 10 });
  assert.deepEqual(v.queue, { sales_waiting_to_upload: 0, needing_a_person: 0, recent_errors: [] });
  assert.deepEqual(v.card_reader, { ready: true }); assert.equal(v.shopify_connected, true); assert.equal(v.receipt_page_set_up, true);
  assert.deepEqual(v.catalogue, { variations: 312, last_imported: '2026-10-18 9:00 am', stock_counted_since: '2026-10-17 6:30 pm' });
  assert.deepEqual(v.notifications, { unread: 0, recent: [] }); assert.match(v.note, /no printer/);
});
test('a till in trouble: offline, a queue with one stuck sale, the reader down, and the problems in words', () => {
  const v: any = buildStatusView(status({
    sync: { state: 'offline', at: at(2026, 10, 18, 11, 0).toISOString(), error: 'No connection' }, zeller: { ready: false, message: 'Reader offline - no internet' },
    outbox: [
      { queuedAt: at(2026, 10, 18, 13, 0).toISOString(), tries: 3, error: 'Shopify said: stock is wrong' }, { queuedAt: at(2026, 10, 18, 12, 0).toISOString(), tries: 1, error: 'No connection' },
      { queuedAt: at(2026, 10, 18, 14, 0).toISOString(), tries: 9, error: 'No connection', blocked: true }, { queuedAt: at(2026, 10, 18, 14, 30).toISOString(), tries: 0, error: 'A fourth different problem' }, { queuedAt: at(2026, 10, 18, 14, 31).toISOString(), tries: 0 },
    ],
  }));
  assert.equal(v.sync.state, 'offline'); assert.equal(v.sync.message, 'No connection'); assert.equal(v.sync.minutes_since_last_sync, 245);
  assert.equal(v.queue.sales_waiting_to_upload, 5); assert.equal(v.queue.needing_a_person, 1); assert.equal(v.queue.oldest_waiting_since, '2026-10-18 12:00 pm');
  assert.deepEqual(v.queue.recent_errors, ['Shopify said: stock is wrong', 'No connection', 'A fourth different problem'], 'duplicates are left out and there are at most three');
  assert.deepEqual(v.card_reader, { ready: false, message: 'Reader offline - no internet' });
});
test('a till that has never synced says so, and a bad time is not a crash', () => {
  const v: any = buildStatusView(status({ sync: { state: 'idle' }, catalogueAt: undefined, stockSince: undefined }));
  assert.equal(v.sync.last_sync, 'not yet'); assert.equal(v.sync.minutes_since_last_sync, undefined); assert.equal(v.catalogue.last_imported, 'never'); assert.equal(v.catalogue.stock_counted_since, undefined);
  const odd: any = buildStatusView(status({ sync: { state: 'error', at: 'not a date' }, outbox: [{ queuedAt: 'nope', tries: 0 }] }));
  assert.equal(odd.sync.last_sync, 'not yet'); assert.equal(odd.queue.oldest_waiting_since, 'unknown');
  assert.equal(whenText(undefined), null); assert.equal(whenText(''), null); assert.equal(whenText('zzz'), null);
});
test('errors are one short line with web addresses taken out', () => {
  assert.equal(safeLine('Failed to reach https://shop.example.com/admin/api?token=abc123 twice\n\nretrying'), 'Failed to reach [address] twice retrying');
  assert.equal(safeLine('x'.repeat(400)).length, 160); assert.ok(safeLine('x'.repeat(400)).endsWith('…')); assert.equal(safeLine(undefined), ''); assert.equal(safeLine(null), '');
  const v: any = buildStatusView(status({ sync: { state: 'error', error: 'Upload to https://hooks.example.com/x failed' }, outbox: [{ queuedAt: at(2026, 10, 18, 9, 0).toISOString(), tries: 1, error: 'POST https://a.example.com/b?c=d 500' }] }));
  assert.equal(v.sync.message, 'Upload to [address] failed'); assert.deepEqual(v.queue.recent_errors, ['POST [address] 500']);
});
test('notifications: only the kinds about how the till is doing, newest first, five at most, and the unread count follows the same kinds', () => {
  const n = (i: number, kind: any, read = false) => ({ ts: at(2026, 10, 18, 8, i).toISOString(), kind, title: `Notice ${i}`, read });
  const v: any = buildStatusView(status({ notices: [n(1, 'sync'), n(2, 'queue', true), n(3, 'refund'), n(4, 'pass'), n(5, 'reader'), n(6, 'stock'), n(7, 'info'), n(8, 'sync'), n(9, 'refund')] }));
  assert.deepEqual(v.notifications.recent.map((r: any) => r.title), ['Notice 8', 'Notice 7', 'Notice 6', 'Notice 5', 'Notice 2']);
  assert.deepEqual(v.notifications.recent[0], { when: '2026-10-18 8:08 am', kind: 'sync', title: 'Notice 8', read: false });
  assert.equal(v.notifications.unread, 5); assert.ok(!JSON.stringify(v).match(/Notice (3|4|9)\b/), 'refund and pass notices name customers and staff, so they are left out');
});
test('no body, no sale, no card attempt and no terminal detail is in the status view', () => {
  const v = JSON.stringify(buildStatusView(status({ notices: [{ ts: NOW as any, kind: 'sync', title: 'Receipt page not published', read: false, body: 'Customer jane@example.com' } as any], outbox: [{ queuedAt: at(2026, 10, 18, 9, 0).toISOString(), tries: 1, sale: { total: 4200, customer: 'Jane' } } as any] })));
  assert.ok(!/jane|4200|attempt|terminal|serial/i.test(v), v);
});

// ---- the tools ----
const till = (over: { settings?: Record<string, unknown> | null; status?: Record<string, unknown> } = {}): TillState => ({ settings: over.settings === undefined ? view() : over.settings, status: over.status ?? buildStatusView(status()) });
const call = (name: string, args: unknown = {}) => ({ id: 'c1', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
const run = (name: string, args: unknown, role: string, t: TillState | null = till(), policy = resolvePolicy('local')) =>
  runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: { pages: [], role, maxChars: 6000, policy, ...(t ? { till: t } : {}) } });
const out = (r: ReturnType<typeof run>): any => JSON.parse(r.message.content ?? '{}');

test('app_status works for every role, and read_settings only for a manager or an owner', () => {
  for (const role of ['cashier', 'manager', 'owner']) { const r = run('app_status', {}, role); assert.equal(r.record.ok, true); assert.equal(out(r).sync.state, 'idle'); assert.equal(out(r).queue.sales_waiting_to_upload, 0); }
  for (const role of ['manager', 'owner']) { const r = run('read_settings', {}, role); assert.equal(r.record.ok, true); assert.equal(out(r).checkout.cash_rounding, true); assert.equal(out(r).assistant.model, 'llama3.1:8b'); }
  const no = run('read_settings', {}, 'cashier'); assert.equal(no.record.ok, false); assert.deepEqual(out(no), { error: 'There is no tool called "read_settings".' });
  const unknown = run('not_a_tool', {}, 'cashier'); assert.equal(out(unknown).error.replace('not_a_tool', 'read_settings'), out(no).error, 'a role that may not read settings gets exactly what an unknown tool gets');
  assert.equal(run('read_settings', {}, 'nobody').record.ok, false); assert.equal(run('read_settings', {}, '').record.ok, false);
  assert.match(run('read_settings', { section: 'staff' }, 'manager').message.content ?? '', /Cashiers cannot set line prices/);
  assert.equal(run('read_settings', { section: 'nope' }, 'manager').record.ok, false);
});
test('with no snapshot (practice data) both tools say they could not read the till, and give nothing else', () => {
  for (const [n, role] of [['app_status', 'cashier'], ['read_settings', 'owner']] as const) { const r = run(n, {}, role, null); assert.equal(r.record.ok, false); assert.match(out(r).error, /could not be read/); }
  assert.equal(out(run('read_settings', {}, 'owner', till({ settings: null }))).error, 'The till\'s state could not be read just now.', 'a snapshot with no settings is the same answer');
});
test('the request leaves read_settings out for a cashier and keeps it for a manager and an owner', () => {
  const names = (role: string) => makeToolSet({ pages: [], role, contextSize: 8000 }).tools.map(t => t.def.function.name);
  assert.ok(!names('cashier').includes('read_settings')); assert.ok(names('cashier').includes('app_status')); assert.equal(names('cashier').length, 15);
  for (const r of ['manager', 'owner']) { assert.ok(names(r).includes('read_settings')); assert.equal(names(r).length, 16); }
  assert.ok(!names('anything else').includes('read_settings'), 'an unknown role is treated as the least access');
  assert.deepEqual(toolsFor('cashier').map(t => t.def.function.name), names('cashier'));
  const custom = makeToolSet({ pages: [], role: 'cashier', contextSize: 8000, tools: [readSettingsTool, appStatusTool] }); assert.deepEqual(custom.tools.map(t => t.def.function.name), ['app_status'], 'a tool list handed in is filtered by role too');
  const set = makeToolSet({ pages: [], role: 'manager', contextSize: 8000, till: till() }); assert.ok(set.ctx.till); assert.equal(makeToolSet({ pages: [], role: 'manager', contextSize: 8000 }).ctx.till, undefined);
  assert.ok(!JSON.stringify(toolDefs(toolsFor('cashier'))).includes('read_settings'), 'the definitions sent for a cashier do not name it');
});
test('every field either tool can return is in its field map, so the gate drops nothing and reports nothing unknown', () => {
  for (const policy of [resolvePolicy('local'), resolvePolicy('remote')]) {
    const s = applyGate(settingsReply(view(), undefined), readSettingsTool.gate, policy); assert.deepEqual(s.unknown, []); assert.deepEqual(s.withheld, {}); assert.deepEqual(s.used, ['shop']);
    const a = applyGate(buildStatusView(status({ notices: [{ ts: NOW as any, kind: 'sync', title: 'x', read: false }], outbox: [{ queuedAt: at(2026, 10, 18, 9, 0).toISOString(), tries: 1, error: 'oops', blocked: true }], sync: { state: 'error', at: at(2026, 10, 18, 9, 0).toISOString(), error: 'e' }, zeller: { ready: false, message: 'm' } })), appStatusTool.gate, policy);
    assert.deepEqual(a.unknown, []); assert.deepEqual(a.withheld, {});
  }
  for (const s of SETTINGS_SECTIONS) assert.deepEqual(applyGate(settingsReply(view(), s), readSettingsTool.gate, resolvePolicy('remote')).unknown, [], s);
  assert.deepEqual(applyGate(settingsReply(view({}, { canSeeAssistant: false }), 'all'), readSettingsTool.gate, resolvePolicy('remote')).unknown, []);
});
test('the privacy toggles reach both tools: shop data set to never hides every field, and says so without the content', () => {
  const policy = resolvePolicy('local', { shop: 'never' });
  const r = out(run('app_status', {}, 'cashier', till(), policy)); assert.match(r.privacy_note, /shop data/); assert.equal(r.sync, undefined); assert.equal(r.queue, undefined);
  const m = out(run('read_settings', {}, 'owner', till(), policy)); assert.match(m.privacy_note, /shop data/); assert.equal(m.checkout, undefined);
  assert.equal(run('app_status', {}, 'cashier', till(), policy).record.withheld?.shop! > 0, true);
});
test('an email or a card number in a problem message is masked by the gate on a remote endpoint, and an email stays on a local one that allows it', () => {
  const t = till({ status: buildStatusView(status({ sync: { state: 'error', error: 'Could not email jane@example.com about card 4242 4242 4242 4242' } })) });
  const remote = out(run('app_status', {}, 'cashier', t, resolvePolicy('remote'))); assert.ok(!/jane@/.test(JSON.stringify(remote)) && !/4242/.test(JSON.stringify(remote))); assert.match(remote.sync.message, /\[email address\].*\[card number\]/);
  const local = out(run('app_status', {}, 'cashier', t, resolvePolicy('local'))); assert.match(local.sync.message, /jane@example\.com/); assert.ok(!/4242/.test(JSON.stringify(local)), 'a card number is never sent, even locally');
});
test('both tools are read only: the snapshot can be frozen and the calls change nothing', () => {
  const deepFreeze = (o: any): any => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const t = deepFreeze(till()); const before = JSON.stringify(t);
  for (const [n, role] of [['app_status', 'cashier'], ['read_settings', 'owner'], ['read_settings', 'cashier']] as const) assert.doesNotThrow(() => run(n, {}, role, t));
  assert.equal(JSON.stringify(t), before);
  for (const tool of [appStatusTool, readSettingsTool]) {
    assert.doesNotMatch(JSON.stringify(tool.def), /[\u2013\u2014]/); assert.ok(tool.def.function.description.length > 20);
    assert.equal((tool.def.function.parameters as any).type, 'object'); assert.equal((tool.def.function.parameters as any).additionalProperties, false);
  }
  assert.deepEqual(appStatusTool.def.function.parameters, { type: 'object', properties: {}, additionalProperties: false });
});
test('the status tool is offered with the other tools and keeps every role', () => {
  assert.equal(appStatusTool.roles, undefined); assert.deepEqual(readSettingsTool.roles, ['manager', 'owner']);
  const order = ASSISTANT_TOOLS.map(t => t.def.function.name); assert.ok(order.indexOf('screen_context') < order.indexOf('app_status') && order.indexOf('read_settings') < order.indexOf('find_products'));
});

// ---- the prompt ----
test('the prompt for a cashier names app_status and never read_settings, and counts the tools it offers', () => {
  const p = buildSystemPrompt('short', true);
  assert.match(p, /fifteen tools/); assert.match(p, /app_status/); assert.doesNotMatch(p, /read_settings/); assert.doesNotMatch(p, /manager|owner|printer|hardware|settings page|web address/i); assert.doesNotMatch(p, /[\u2013\u2014]/);
  const cashier = buildSystemPrompt('short', true, toolsFor('cashier').map(t => t.def.function.name)); assert.equal(cashier, p, 'the default is the tools every role has');
  assert.doesNotMatch(buildSystemPrompt('short', false), /app_status/);
});
test('the prompt for a manager or an owner also names read_settings and says to point at the screen, never change it', () => {
  const p = buildSystemPrompt('short', true, toolsFor('manager').map(t => t.def.function.name));
  assert.match(p, /sixteen tools/); assert.match(p, /read_settings/); assert.match(p, /Never change one/); assert.match(p, /never show a web address, key or PIN/); assert.doesNotMatch(p, /[\u2013\u2014]/); assert.doesNotMatch(p, /\bmanager\b|\bowner\b|printer/i);
});
