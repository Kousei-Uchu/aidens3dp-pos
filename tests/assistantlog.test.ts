// Location: tests/assistantlog.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync, strFromU8, strToU8 } from 'fflate';
import { AssistantError, type FetchLike } from '../src/lib/assistantClient';
import { buildMessages, buildMessagesDetailed, prepare, type ChatEntry } from '../src/lib/assistantChat';
import {
  LOG_FAIL_LINE, META_NAME, TEXT_CLIP, askLogged, buildEvent, createLogStore, dayName, fnv1a, localDay, logDirFromDocuments, logEndpoint, logStaff, monthName,
  type LogContext, type LogEvent, type LogFs,
} from '../src/lib/assistantLog';

// ---- helpers ----
function memFs() {
  const files = new Map<string, Uint8Array>(); const fail = { write: false };
  const fs: LogFs = {
    async read(n) { return files.get(n) ?? null; },
    async write(n, d) { if (fail.write) throw new Error('disk full'); files.set(n, d); },
    async remove(n) { files.delete(n); },
    async list() { return [...files.entries()].map(([name, d]) => ({ name, size: d.length })); },
  };
  return { fs, files, fail };
}
const at = (day: string, h = 10) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
const staff = { id: 's1', name: 'Casey', role: 'cashier' as const };
let n = 0;
const ev = (when: number, over: Partial<LogEvent> = {}): LogEvent => ({ v: 1, id: `ev${++n}`, at: when, kind: 'ask', staff, practice: false, user: { id: `u${n}`, text: 'hi' }, reply: { id: `r${n}`, text: 'hello' }, ...over });
const lines = (b: Uint8Array) => strFromU8(b).split('\n').filter(Boolean).map(l => JSON.parse(l) as LogEvent);
const KEY = 'sk-test-SECRETSECRET1234';
const entry = (i: number, role: 'user' | 'assistant', text: string): ChatEntry => ({ id: `h${i}`, role, text, at: i });

function fake(reply: unknown, status = 200) {
  const seen: { messages: unknown }[] = [];
  const f: FetchLike = async (_u, init) => { seen.push({ messages: JSON.parse(init.body ?? '{}').messages }); return { ok: status < 300, status, text: async () => JSON.stringify(reply) }; };
  return { f, seen };
}
const okReply = (content: string) => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] });
let t = at('2026-10-17'); let idn = 0;
const input = (text: string, history: ChatEntry[] = [], detail: 'short' | 'more' = 'short') => ({ history, text, detail, settings: { contextSize: 8000, temperature: 0.2 }, endpoint: { baseUrl: 'http://192.168.1.20:11434/v1', model: 'm', timeoutSec: 5, apiKey: KEY }, id: () => `id${++idn}`, now: () => (t += 10) });
function ctx(sink: LogContext['sink'], known: (id: string) => boolean = () => false): LogContext {
  return { staff, practice: false, endpoint: logEndpoint('http://192.168.1.20:11434/v1', 'm', 'auto'), apiKey: KEY, known, sink, newId: () => `ev-${++idn}` };
}

// ---- where it lives ----
test('the log folder is next to Documents on iOS, so Files.app cannot see it', () => {
  const d = logDirFromDocuments('file:///var/mobile/Containers/Data/Application/ABC/Documents/');
  assert.equal(d, 'file:///var/mobile/Containers/Data/Application/ABC/Library/Application Support/assistant-log/');
  assert.ok(!/\/Documents\//.test(d!));
  assert.equal(logDirFromDocuments('file:///data/user/0/app/files/'), 'file:///data/user/0/app/files/assistant-log/');
  assert.equal(logDirFromDocuments(''), null); assert.equal(logDirFromDocuments(null), null);
});

test('staff and endpoint records hold a name and a host, nothing else', () => {
  assert.deepEqual(logStaff('s1', [{ id: 's1', name: 'Casey' }], 'cashier'), staff);
  assert.deepEqual(logStaff(undefined, [], 'owner'), { id: 'owner', name: 'Owner', role: 'owner' });
  assert.deepEqual(logEndpoint('http://192.168.1.20:11434/v1', 'gpt-oss:20b', 'auto'), { host: '192.168.1.20', model: 'gpt-oss:20b', scope: 'local' });
  assert.equal(logEndpoint('https://api.example.com/v1?key=abc', 'm', 'auto').scope, 'remote');
  assert.ok(!JSON.stringify(logEndpoint('https://api.example.com/v1?key=abc', 'm', 'auto')).includes('abc'));
  assert.equal(logEndpoint('http://192.168.1.20:11434/v1', 'm', 'remote').scope, 'remote'); // the override wins
});

// ---- what the chat now reports ----
test('buildMessagesDetailed says which entries went and what old history had hidden, and buildMessages is unchanged', () => {
  const h = [entry(1, 'user', 'q1'), entry(2, 'assistant', 'a1 write to jo@example.com'), entry(3, 'user', 'q2')];
  const d = buildMessagesDetailed(h, 'short', 8000);
  assert.deepEqual(d.included.map(e => e.id), ['h1', 'h2', 'h3']); assert.deepEqual(d.masked, { email: 1 });
  assert.deepEqual(d.messages, buildMessages(h, 'short', 8000)); assert.equal(d.system, d.messages[0].content);
  const tight = buildMessagesDetailed([...h.slice(0, 2), entry(3, 'user', 'z'.repeat(900))], 'short', 1); // the context floor is 200 tokens, so only the newest (cut down) fits
  assert.deepEqual(tight.included.map(e => e.id), ['h3']);
});
test('prepare counts what was hidden in the typed text as well', () => {
  const p = prepare(input('mail me at jo@example.com'));
  assert.deepEqual(p.masked, { email: 1 }); assert.equal(p.included[p.included.length - 1].id, p.user.id); assert.ok(!p.user.text.includes('jo@'));
});

// ---- events ----
test('askLogged records the question, the reply, what was sent and what was hidden, and the hash matches the request', async () => {
  const { fs, files } = memFs(); const store = createLogStore(fs, { now: () => at('2026-10-17') });
  const { f, seen } = fake(okReply('Tap Charge.'));
  const out = await askLogged(f, input('My card is 4111 1111 1111 1111, how do I charge?'), ctx(store.append));
  assert.ok(out.ok && !out.logError);
  const e = lines(files.get(dayName('2026-10-17'))!)[0];
  assert.equal(e.kind, 'ask'); assert.equal(e.staff.name, 'Casey'); assert.equal(e.practice, false);
  assert.equal(e.reply?.text, 'Tap Charge.'); assert.ok(!e.user!.text.includes('4111')); assert.deepEqual(e.masked, { card: 1 });
  assert.equal(e.sent!.hash, fnv1a(JSON.stringify(seen[0].messages)));
  assert.deepEqual(e.endpoint, { host: '192.168.1.20', model: 'm', scope: 'local' });
  assert.equal((await store.meta()).prompts[e.sent!.sys]?.startsWith('You are the help assistant'), true);
});

test('a failed request is logged as an error with the question that was going to be sent', async () => {
  const { fs } = memFs(); const store = createLogStore(fs, { now: () => at('2026-10-17') });
  const { f } = fake({ error: { message: `bad key ${KEY}` } }, 401);
  const out = await askLogged(f, input('How do I refund?'), ctx(store.append));
  assert.ok(!out.ok && out.error instanceof AssistantError);
  const { events } = await store.events(); assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'error'); assert.equal(events[0].error?.kind, 'key_rejected'); assert.equal(events[0].user?.text, 'How do I refund?');
  assert.equal(events[0].reply, undefined); assert.ok(!JSON.stringify(events[0]).includes('SECRETSECRET'));
});

test('the key can never reach a log line, even if the model or an error repeats it', () => {
  const p = { user: entry(9, 'user', 'q'), messages: [{ role: 'system' as const, content: 's' }, { role: 'user' as const, content: 'q' }], included: [entry(1, 'assistant', `old ${KEY}`), entry(9, 'user', 'q')], system: 's', masked: {} };
  const b = buildEvent({ id: 'x', now: 1, staff, practice: false, detail: 'short', p, known: () => false, reply: entry(10, 'assistant', `here: ${KEY} and Bearer abcdefghijkl`), error: { kind: 'bad_reply', message: `oops ${KEY}` }, ms: 1, apiKey: KEY });
  const s = JSON.stringify(b.event); assert.ok(!s.includes('SECRETSECRET') && !s.includes('abcdefghijkl'), s);
});

test('long texts are cut so one reply cannot flood the log', () => {
  const big = 'x'.repeat(TEXT_CLIP + 500);
  const p = { user: entry(9, 'user', 'q'), messages: [], included: [entry(9, 'user', 'q')], system: 's', masked: {} };
  const b = buildEvent({ id: 'x', now: 1, staff, practice: false, detail: 'short', p, known: () => false, reply: entry(10, 'assistant', big), ms: 1 });
  assert.ok(b.event.reply!.text.length <= TEXT_CLIP + 5 && b.event.reply!.text.endsWith('[cut]'));
});

test('earlier messages are stored by id once the log has them, and inline when it does not (after a restart, or old history)', async () => {
  const a = memFs(); const s1 = createLogStore(a.fs, { now: () => at('2026-10-17') });
  const old = [entry(1, 'user', 'earlier question'), entry(2, 'assistant', 'earlier answer')];
  await askLogged(fake(okReply('one')).f, input('first', old), ctx(s1.append, s1.knows));
  let evs = (await s1.events()).events; assert.equal(evs[0].sent!.parts.length, 3);
  assert.deepEqual(evs[0].sent!.parts.map(p => p.text !== undefined), [true, true, false]); // old history was never logged: inline. The new question is the event's own text.
  const hist = [...old, evs[0].user as any, evs[0].reply as any].map((x, i) => (i < 2 ? x : { id: x.id, role: i === 2 ? 'user' : 'assistant', text: x.text, at: i }));
  await askLogged(fake(okReply('two')).f, input('second', hist as ChatEntry[]), ctx(s1.append, s1.knows));
  evs = (await s1.events()).events; const parts = evs[1].sent!.parts;
  assert.deepEqual(parts.map(p => p.text !== undefined), [true, true, false, false, false]); // the first answered pair is now known, so only ids
  const s2 = createLogStore(a.fs, { now: () => at('2026-10-17') }); // a restart: nothing is known in memory
  await askLogged(fake(okReply('three')).f, input('third', hist as ChatEntry[]), ctx(s2.append, s2.knows));
  assert.equal((await s2.events()).events[2].sent!.parts.filter(p => p.text !== undefined).length, 4);
});

test('a log that cannot be written never stops the answer, and says so', async () => {
  const { fs, fail } = memFs(); const store = createLogStore(fs, { now: () => at('2026-10-17') }); fail.write = true;
  const ok = await askLogged(fake(okReply('fine')).f, input('q'), ctx(store.append));
  assert.ok(ok.ok); assert.equal(ok.logError, LOG_FAIL_LINE); if (ok.ok) assert.equal(ok.result.reply.text, 'fine');
  const bad = await askLogged(fake({}, 500).f, input('q'), ctx(store.append));
  assert.ok(!bad.ok); assert.equal(bad.logError, LOG_FAIL_LINE);
});

// ---- the store ----
test('events go to one file a day, in order, and the system prompt is kept once', async () => {
  const { fs, files } = memFs(); let clock = at('2026-10-17'); const store = createLogStore(fs, { now: () => clock });
  const prompt = { hash: 'abc12345', text: 'RULES' };
  await store.append(ev(at('2026-10-17', 9)), prompt); await store.append(ev(at('2026-10-17', 11)), prompt); clock = at('2026-10-18');
  await store.append(ev(at('2026-10-18', 9)), prompt);
  assert.deepEqual([...files.keys()].filter(k => k.startsWith('d-')).sort(), ['d-2026-10-17.jsonl', 'd-2026-10-18.jsonl']);
  assert.equal(lines(files.get('d-2026-10-17.jsonl')!).length, 2);
  assert.deepEqual((await store.meta()).prompts, { abc12345: 'RULES' });
  assert.deepEqual(await store.days(), ['2026-10-17', '2026-10-18']);
  const r = await store.events({ from: '2026-10-18' }); assert.equal(r.events.length, 1);
});

test('finished months are packed into one gzip file and the days are removed; the current month stays as days', async () => {
  const { fs, files } = memFs(); let clock = at('2026-09-05'); const store = createLogStore(fs, { now: () => clock });
  await store.append(ev(at('2026-09-05'))); await store.append(ev(at('2026-09-20')));
  assert.ok(files.has('d-2026-09-05.jsonl'));
  clock = at('2026-10-02'); await store.append(ev(at('2026-10-02')));
  assert.ok(files.has(monthName('2026-09')) && !files.has('d-2026-09-05.jsonl') && !files.has('d-2026-09-20.jsonl') && files.has('d-2026-10-02.jsonl'));
  const all = await store.events(); assert.equal(all.events.length, 3); assert.equal(all.bad, 0);
  assert.equal((await store.events({ from: '2026-09-01', to: '2026-09-30' })).events.length, 2);
  assert.equal((await store.events({ from: '2026-10-01' })).events.length, 1);
});

test('a crash half way through packing repeats nothing: lines are matched by id', async () => {
  const { fs, files } = memFs(); const a = ev(at('2026-09-05')); const b = ev(at('2026-09-06'));
  files.set(monthName('2026-09'), gzipSync(strToU8(`${JSON.stringify(a)}\n`)));
  files.set('d-2026-09-05.jsonl', strToU8(`${JSON.stringify(a)}\n`)); files.set('d-2026-09-06.jsonl', strToU8(`${JSON.stringify(b)}\n`));
  const store = createLogStore(fs, { now: () => at('2026-10-02') }); await store.maintain();
  const r = await store.events(); assert.deepEqual(r.events.map(e => e.id), [a.id, b.id]); assert.ok(![...files.keys()].some(k => k.startsWith('d-')));
});

test('unreadable lines are counted, not fatal', async () => {
  const { fs, files } = memFs(); files.set('d-2026-10-17.jsonl', strToU8(`${JSON.stringify(ev(at('2026-10-17')))}\nnot json\n{"id":"x"}\n`));
  const r = await createLogStore(fs, { now: () => at('2026-10-17') }).events(); assert.equal(r.events.length, 1); assert.equal(r.bad, 2);
});

test('past the cap the oldest files go first, a purge event and the meta say so, and today is never removed', async () => {
  const { fs, files } = memFs(); let clock = at('2026-10-17');
  const big = (day: string) => ev(at(day), { reply: { id: `r-${day}`, text: 'y'.repeat(400) } });
  const store = createLogStore(fs, { now: () => clock, capBytes: () => 2500 });
  for (const d of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) { clock = at(d); await store.append(big(d)); }
  clock = at('2026-10-17'); await store.append(big('2026-10-17')); await store.append(big('2026-10-17'));
  const st = await store.status(); assert.ok(st.purgedEvents > 0 && st.purgedThrough, JSON.stringify(st));
  assert.ok(files.has('d-2026-10-17.jsonl')); assert.ok(!files.has('d-2026-10-10.jsonl'), 'the oldest day is gone');
  const purge = (await store.events()).events.find(e => e.kind === 'purge'); assert.ok(purge && purge.purge!.events >= 1 && purge.purge!.from === '2026-10-10');
  assert.ok(st.bytes <= 2500 * 1.2, `${st.bytes}`);
  const tiny = createLogStore(memFs().fs, { now: () => at('2026-10-17'), capBytes: () => 10 }); await tiny.append(big('2026-10-17'));
  assert.equal((await tiny.events()).events.filter(e => e.kind === 'ask').length, 1); // only today is left, so nothing more can go
});

test('status warns from 80 percent of the cap and not before', async () => {
  const { fs } = memFs(); const store = createLogStore(fs, { now: () => at('2026-10-17'), capBytes: () => 100000 });
  await store.append(ev(at('2026-10-17'))); assert.equal((await store.status()).warn, false);
  const used = (await store.status()).bytes; const s2 = createLogStore(fs, { now: () => at('2026-10-17'), capBytes: () => Math.ceil(used / 0.85) });
  const st = await s2.status(); assert.equal(st.warn, true); assert.ok(st.percent >= 80 && st.percent < 100);
});

test('the meta file is never counted as a conversation and a damaged one is replaced', async () => {
  const { fs, files } = memFs(); files.set(META_NAME, strToU8('{not json'));
  const store = createLogStore(fs, { now: () => at('2026-10-17') }); assert.deepEqual(await store.meta(), { v: 1, prompts: {}, purgedEvents: 0 });
  await store.append(ev(at('2026-10-17')), { hash: 'h', text: 'T' }); assert.equal((await store.meta()).prompts.h, 'T');
  assert.equal((await store.events()).events.length, 1);
});

// ---- the rules about where the log may go ----
test('the log stays off the sync and out of backups, and nothing is logged in practice mode', () => {
  for (const f of ['src/lib/sync.ts', 'src/lib/backupFile.ts', 'src/lib/backupIO.ts']) assert.ok(!/assistantLog|assistant-log/.test(readFileSync(f, 'utf8')), `${f} must not touch the log`);
  const io = readFileSync('src/lib/assistantLogIO.ts', 'utf8');
  assert.match(io, /isTraining\(\)/); assert.ok(!/documentDirectory\s*\+/.test(io), 'the folder comes from logDirFromDocuments only');
  assert.match(readFileSync('src/screens/Assistant.tsx', 'utf8'), /logged for the manager/);
});
