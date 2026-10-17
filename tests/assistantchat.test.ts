// Location: tests/assistantchat.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AssistantError, type FetchLike } from '../src/lib/assistantClient';
import {
  ASSISTANT_OPEN_TO_ALL, HISTORY_CAP, PRACTICE_BLOCK, ask, assistantEntryVisible, bannerAction, bannerFor, buildMessages, buildSystemPrompt, canRetry, capHistory,
  estimateTokens, historyKey, luhnOk, maskedNote, readHistory, scrubText, sendBlock, stripDashes, type ChatEntry,
} from '../src/lib/assistantChat';

const EM = '\u2014'; const EN = '\u2013';
const entry = (i: number, role: 'user' | 'assistant', text: string): ChatEntry => ({ id: `e${i}`, role, text, at: i });

test('luhnOk accepts real test card numbers and refuses the rest', () => {
  assert.equal(luhnOk('4111111111111111'), true);
  assert.equal(luhnOk('4111111111111112'), false);
  assert.equal(luhnOk('12345'), false);
  assert.equal(luhnOk('4111 1111 1111 1111'), false); // digits only: the caller strips spaces first
});

test('scrubText masks emails, phone numbers, Luhn valid cards and keys, and counts them', () => {
  const r = scrubText('Email jo@example.com or 0412 345 678, card 4111 1111 1111 1111, key sk-abcdefgh12345678, intl +61 412 345 678');
  assert.ok(!r.text.includes('jo@example.com') && !r.text.includes('345 678') && !r.text.includes('4111') && !r.text.includes('sk-abc'), r.text);
  assert.deepEqual(r.masked, { key: 1, card: 1, email: 1, phone: 2 });
  assert.match(r.text, /\[email address\]/); assert.match(r.text, /\[card number\]/); assert.match(r.text, /\[phone number\]/);
});

test('scrubText leaves prices, dates, order numbers and ordinary words alone', () => {
  for (const ok of ['The total was $1,234.50 on 2026-10-17', 'Order #123456789 for 12 items', 'Call the shop on Monday', 'A card number 1234 5678 9012 3456 that fails the check', 'SKU ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGH']) {
    const r = scrubText(ok); assert.equal(r.text, ok, ok); assert.deepEqual(r.masked, {});
  }
});

test('scrubText masks long mixed letter and digit tokens, and bearer tokens', () => {
  const r = scrubText('token a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6 and Authorization: Bearer abcdefghijklmnop1234');
  assert.ok(!r.text.includes('a1b2c3d4e5f6a1b2') && !r.text.includes('abcdefghijklmnop1234'), r.text);
  assert.equal(r.masked.key, 2);
});

test('maskedNote reads naturally and is empty when nothing was hidden', () => {
  assert.equal(maskedNote({}), '');
  assert.equal(maskedNote({ email: 1 }), 'Hidden before sending: 1 email address.');
  assert.equal(maskedNote({ email: 2, phone: 1 }), 'Hidden before sending: 2 email addresses and 1 phone number.');
  assert.equal(maskedNote({ email: 1, phone: 2, card: 1 }), 'Hidden before sending: 1 email address, 2 phone numbers and 1 card number.');
});

test('stripDashes removes em and en dashes from replies', () => {
  const out = stripDashes(`Tap Charge ${EM} then pick a tender${EN}cash or card. Open 9${EN}5 daily. Done${EM}`);
  assert.ok(!out.includes(EM) && !out.includes(EN), out);
  assert.match(out, /9 to 5/); assert.match(out, /Tap Charge, then pick a tender, cash or card/);
  assert.equal(stripDashes('plain-hyphen text'), 'plain-hyphen text');
});

test('the system prompt states the rules and carries no dashes of its own, in either detail setting', () => {
  for (const d of ['short', 'more'] as const) {
    const p = buildSystemPrompt(d);
    assert.ok(!p.includes(EM) && !p.includes(EN));
    for (const must of ['Australian English', 'never change anything', 'Never use em dashes', 'Reply in the language', 'cannot see products']) assert.ok(p.toLowerCase().includes(must.toLowerCase()), must);
  }
  assert.ok(buildSystemPrompt('more').includes('more detail')); assert.ok(!buildSystemPrompt('short').includes('more detail'));
});

test('the system prompt names no screen, feature or role, so there is nothing in it to leak', () => {
  const p = buildSystemPrompt('short').toLowerCase();
  for (const word of ['refund screen', 'settings screen', 'cash drawer', 'manager', 'owner', 'cashier', 'gift card', 'staff screen', 'audit']) assert.ok(!p.includes(word), word);
});

test('history is per staff member, and the key never holds anything but the id', () => {
  assert.equal(historyKey('s1'), 'assistant.history.v1.s1'); assert.notEqual(historyKey('s1'), historyKey('s2'));
  assert.equal(historyKey(undefined), 'assistant.history.v1.owner'); assert.equal(historyKey('  '), 'assistant.history.v1.owner');
});

test('readHistory keeps only well formed entries and caps at 200, newest kept', () => {
  assert.deepEqual(readHistory(undefined), []); assert.deepEqual(readHistory('x'), []);
  const rows = readHistory([{ id: 'a', role: 'user', text: 'hi', at: 1 }, { id: 'b', role: 'system', text: 'no', at: 2 }, { id: 'c', role: 'assistant', text: 5, at: 3 }, null, { id: 'd', role: 'assistant', text: 'yo', at: 'x', note: 'n' }]);
  assert.deepEqual(rows.map(r => r.id), ['a', 'd']); assert.equal(rows[1].at, 0); assert.equal(rows[1].note, 'n');
  const many = Array.from({ length: 250 }, (_, i) => entry(i, i % 2 ? 'assistant' : 'user', `m${i}`));
  const capped = capHistory(many); assert.equal(capped.length, HISTORY_CAP); assert.equal(capped[0].id, 'e50'); assert.equal(capped[capped.length - 1].id, 'e249');
  assert.equal(readHistory(many).length, HISTORY_CAP);
});

test('buildMessages: system prompt first, oldest dropped first to fit the context, never opens on a reply', () => {
  const h: ChatEntry[] = []; for (let i = 0; i < 40; i++) h.push(entry(i, i % 2 === 0 ? 'user' : 'assistant', `message number ${i} ` + 'x'.repeat(200)));
  h.push(entry(40, 'user', 'the newest question'));
  const m = buildMessages(h, 'short', 1200);
  assert.equal(m[0].role, 'system'); assert.equal(m[m.length - 1].content, 'the newest question'); assert.equal(m[1].role, 'user');
  assert.ok(m.length < h.length + 1 && m.length >= 2);
  const total = m.reduce((n, x) => n + estimateTokens(x.content ?? ''), 0); assert.ok(total <= 1200 * 0.75 + 5, String(total));
  const ids = m.slice(1).map(x => x.content as string).filter(c => c.startsWith('message number')).map(c => Number(/number (\d+)/.exec(c)![1]));
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b)); assert.ok(!ids.includes(0));
});

test('buildMessages keeps the newest message even when it alone is too long, cut down to fit', () => {
  const m = buildMessages([entry(1, 'user', 'y'.repeat(50000))], 'short', 2000);
  assert.equal(m.length, 2); assert.ok((m[1].content ?? '').length < 50000); assert.ok((m[1].content ?? '').length > 100);
});

test('buildMessages scrubs old history again at send time', () => {
  const m = buildMessages([entry(1, 'user', 'my email is old@example.com'), entry(2, 'assistant', 'ok'), entry(3, 'user', 'and now?')], 'short', 8000);
  assert.ok(!JSON.stringify(m).includes('old@example.com')); assert.ok(JSON.stringify(m).includes('[email address]'));
});

type Body = { model: string; messages: { role: string; content: string }[]; stream: boolean; tools?: unknown; temperature?: number };
function fake(reply: unknown, status = 200) {
  const seen: { url: string; headers: Record<string, string>; body: Body }[] = [];
  const f: FetchLike = async (url, init) => { seen.push({ url, headers: init.headers, body: JSON.parse(init.body ?? '{}') }); return { ok: status < 300, status, text: async () => (typeof reply === 'string' ? reply : JSON.stringify(reply)) }; };
  return { f, seen };
}
const okReply = (content: string | null) => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] });
let n = 0; const input = (text: string, history: ChatEntry[] = []) => ({ history, text, detail: 'short' as const, settings: { contextSize: 8000, temperature: 0.2 }, endpoint: { baseUrl: 'http://192.168.1.20:11434/v1', model: 'm', timeoutSec: 5, apiKey: 'sk-test-SECRETSECRET1234' }, id: () => `id${++n}`, now: () => 1000 + n });

test('ask sends scrubbed text, no tools, no streaming, and shows a dash free reply', async () => {
  const { f, seen } = fake(okReply(`Tap Charge ${EM} that is it.`));
  const r = await ask(f, input('My card is 4111 1111 1111 1111 and jo@example.com, how do I charge?'));
  const b = seen[0].body;
  assert.equal(b.stream, false); assert.equal(b.tools, undefined); assert.equal(b.model, 'm'); assert.equal(b.messages[0].role, 'system');
  assert.ok(!JSON.stringify(b).includes('4111') && !JSON.stringify(b).includes('jo@example.com'));
  assert.equal(b.messages[b.messages.length - 1].role, 'user');
  assert.equal(r.reply.text, 'Tap Charge, that is it.'); assert.ok(!r.reply.text.includes(EM));
  assert.equal(r.user.role, 'user'); assert.ok(!r.user.text.includes('4111')); assert.match(r.user.note ?? '', /1 email address and 1 card number|1 card number and 1 email address|card number/);
  assert.equal(seen[0].headers.authorization, 'Bearer sk-test-SECRETSECRET1234'); // the key goes in the header and nowhere in the body
  assert.ok(!JSON.stringify(b).includes('SECRETSECRET'));
});

test('ask puts the extra line in the prompt for More detail, and the earlier messages ahead of the new one', async () => {
  const { f, seen } = fake(okReply('Here are the steps.'));
  const hist = [entry(1, 'user', 'how do I charge?'), entry(2, 'assistant', 'Tap Charge.')];
  await ask(f, { ...input('More detail please.', hist), detail: 'more' });
  const b = seen[0].body; assert.ok(b.messages[0].content.includes('more detail'));
  assert.deepEqual(b.messages.slice(1).map(x => x.content), ['how do I charge?', 'Tap Charge.', 'More detail please.']);
});

test('ask turns an empty reply into an error, and server problems keep their kind', async () => {
  await assert.rejects(ask(fake(okReply('   ')).f, input('hi')), (e: AssistantError) => e.kind === 'bad_reply');
  await assert.rejects(ask(fake(okReply(null)).f, input('hi')), (e: AssistantError) => e.kind === 'bad_reply');
  await assert.rejects(ask(fake({ error: { message: 'bad key' } }, 401).f, input('hi')), (e: AssistantError) => e.kind === 'key_rejected');
  await assert.rejects(ask(fake('x').f, { ...input('hi'), endpoint: { baseUrl: '', model: '', timeoutSec: 5 } }), (e: AssistantError) => e.kind === 'not_set_up');
});

test('bannerFor gives each failure its own words, and never shows the key', () => {
  const kinds = ['not_set_up', 'unreachable', 'timeout', 'key_rejected', 'model_not_found', 'no_tools', 'bad_address', 'server_error', 'bad_reply'] as const;
  const titles = new Set(kinds.map(k => bannerFor(new AssistantError(k, 'x')).title)); assert.equal(titles.size, kinds.length);
  const b = bannerFor(new AssistantError('server_error', 'The server said: bad sk-test-SECRETSECRET1234 here'), 'sk-test-SECRETSECRET1234');
  assert.ok(!b.body.includes('SECRETSECRET')); assert.equal(bannerFor(new Error('boom')).kind, 'server_error');
});

test('Retry is only offered where trying again can help, and only editors get the settings button', () => {
  assert.deepEqual((['unreachable', 'timeout', 'server_error', 'bad_reply'] as const).map(canRetry), [true, true, true, true]);
  assert.deepEqual((['not_set_up', 'key_rejected', 'model_not_found', 'no_tools', 'bad_address'] as const).map(canRetry), [false, false, false, false, false]);
  assert.equal(bannerAction(true), 'open_settings'); assert.equal(bannerAction(false), 'ask_manager');
});

test('the Help entry: never on the lock screen, editors only until the audit log lands', () => {
  assert.equal(ASSISTANT_OPEN_TO_ALL, false);
  assert.equal(assistantEntryVisible({ locked: true, canEdit: true }), false);
  assert.equal(assistantEntryVisible({ locked: false, canEdit: true }), true);
  assert.equal(assistantEntryVisible({ locked: false, canEdit: false }), false);
  assert.equal(assistantEntryVisible({ locked: false, canEdit: false, openToAll: true }), true);
  assert.equal(assistantEntryVisible({ locked: true, canEdit: false, openToAll: true }), false);
});

test('sending is blocked in practice mode and not otherwise', () => {
  assert.equal(sendBlock({ training: true }), PRACTICE_BLOCK); assert.equal(sendBlock({ training: false }), null);
});

test('the screens use these rules: the Help button checks the lock and the editor rule, the chat checks practice mode and keeps history per staff member', () => {
  const help = readFileSync('src/screens/Help.tsx', 'utf8'); const chat = readFileSync('src/screens/Assistant.tsx', 'utf8');
  assert.match(help, /assistantEntryVisible\(\{ locked, canEdit: canEditAssistant \}\)/); assert.match(help, /isLockScreen/);
  assert.match(chat, /sendBlock\(\{ training: isTraining\(\) \}\)/); assert.match(chat, /historyKey\(staffId\)/); assert.match(chat, /if \(isTraining\(\)\)/);
  assert.ok(!/localStorage|pushSharedSettings|AsyncStorage/.test(chat), 'history goes through kv only');
});
