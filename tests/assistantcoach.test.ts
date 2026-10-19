// Location: tests/assistantcoach.test.ts
// The practice mode coach (patch 0173, plan 3.7): the app, not the model, raises the hint ladder; the model only ever holds the
// task and the rungs unlocked so far; a reply that brings in a number nothing allowed is thrown out; the tools are the help pages
// and screens only; the question is scrubbed; and the wiring keeps the rules (no real data, logged as practice).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FetchLike } from '../src/lib/assistantClient';
import { AssistantError } from '../src/lib/assistantClient';
import {
  COACH_TOOL_NAMES, buildCoachPrompt, clearThreads, coachEndLine, coachLeaks, coachRungs, coachTools, askCoach, getThread, hintOnlyReply,
  numbersIn, planCoachAsk, setThread, threadAt, threadKey, usableHistory, type CoachInput, type CoachTask, type CoachTurn,
} from '../src/lib/assistantCoach';
import { makeToolSet } from '../src/lib/assistantTools';
import { freshHints, nextHint } from '../src/lib/trainingHints';
import { MODULES } from '../src/training';

const task: CoachTask = {
  moduleTitle: 'Change a price', moduleSummary: 'Set a new price for one item.', goalId: 'g1', goalTitle: 'Sell one Tadling for a different price',
  ladder: ['Look at the line in the cart.', 'The line has a window of its own.', 'Open the line and set the price to $3.50.'],
};
const ok = (content: string | null, tool_calls?: unknown[]) => ({ choices: [{ message: { role: 'assistant', content, ...(tool_calls ? { tool_calls } : {}) }, finish_reason: 'stop' }] });
/** A fake model that answers each request with the next reply in the list, and keeps every request body. */
const fake = (replies: unknown[]) => { const seen: any[] = []; let i = 0; const f: FetchLike = async (_u, init) => { seen.push(JSON.parse(init.body ?? '{}')); return { ok: true, status: 200, text: async () => JSON.stringify(replies[Math.min(i++, replies.length - 1)]) }; }; return { f, seen }; };
let n = 0;
const input = (over: Partial<CoachInput> = {}): CoachInput => ({
  task, level: 1, text: 'I am stuck', history: [], settings: { contextSize: 8000, temperature: 0.2 }, endpoint: { baseUrl: 'http://localhost:11434/v1', model: 'm', timeoutSec: 30 },
  id: () => `id${++n}`, now: () => 1000 + n, tools: makeToolSet({ pages: [], screens: [], role: 'cashier', contextSize: 8000, tools: coachTools() }), ...over,
});

// ---- the ladder is the app's ----
test('the first ask unlocks hint 1, and each ask after raises it one rung', () => {
  let h = freshHints(); const seen: number[] = [];
  for (let i = 0; i < 3; i++) { const p = planCoachAsk(h, task, false); assert.equal(p.kind, 'ask'); if (p.kind === 'ask') { seen.push(p.level); h = p.next; } }
  assert.deepEqual(seen, [1, 2, 3]);
});
test('the coach never raises the ladder to the answer: after the last written hint only the Hint button shows it', () => {
  const h = nextHint(nextHint(nextHint(freshHints(), 'g1', task.ladder), 'g1', task.ladder), 'g1', task.ladder);
  assert.deepEqual(planCoachAsk(h, task, false), { kind: 'end', revealed: false });
  const shown = nextHint(h, 'g1', task.ladder);
  assert.deepEqual(planCoachAsk(shown, task, false), { kind: 'end', revealed: true });
  assert.match(coachEndLine(false), /Hint/); assert.match(coachEndLine(true), /highlighted/);
});
test('the plan does not look at what was typed, so asking for the answer cannot skip a rung', () => {
  assert.equal(planCoachAsk.length, 3); // (hint, task, offCourse): there is no text to read
  const a = planCoachAsk(freshHints(), task, false); const b = planCoachAsk(freshHints(), task, false);
  assert.deepEqual(a, b);
});
test('a hint pressed for a different goal starts the ladder again from the bottom', () => {
  const h = nextHint(freshHints(), 'other', task.ladder);
  const p = planCoachAsk(h, task, false); assert.equal(p.kind === 'ask' && p.level, 1);
});
test('off course, no hint is spent and the model is not asked', () => {
  assert.deepEqual(planCoachAsk(freshHints(), task, true), { kind: 'stray' });
  const h = nextHint(freshHints(), 'g1', task.ladder); assert.deepEqual(planCoachAsk(h, task, true), { kind: 'stray' });
});

// ---- what the model is given ----
test('the prompt holds the task and only the rungs unlocked, never a later one', () => {
  const p1 = buildCoachPrompt(task, 1);
  assert.ok(p1.includes('Sell one Tadling for a different price') && p1.includes('Look at the line in the cart.'));
  assert.ok(!p1.includes('window of its own') && !p1.includes('$3.50'));
  const p2 = buildCoachPrompt(task, 2); assert.ok(p2.includes('window of its own') && !p2.includes('$3.50'));
  assert.ok(buildCoachPrompt(task, 3).includes('$3.50'));
  assert.deepEqual(coachRungs(task, 0), []); assert.deepEqual(coachRungs(task, 99), [...task.ladder]);
});
test('the prompt tells the model it cannot unlock more, and keeps the style rules', () => {
  const p = buildCoachPrompt(task, 1);
  assert.match(p, /Hint button/); assert.match(p, /never decide to unlock more/); assert.match(p, /Australian English/); assert.match(p, /Never use em dashes/);
  assert.ok(!/[\u2013\u2014]/.test(p), 'the prompt itself has no dashes');
});
test('for every course and goal, the prompt at the first rung never holds the last hint, the reveal spot or the test for done', () => {
  let goals = 0;
  for (const m of MODULES) for (const g of [...m.check1, ...m.check2]) {
    goals++; const t: CoachTask = { moduleTitle: m.title, moduleSummary: m.summary, goalId: g.id, goalTitle: g.title, ladder: g.ladder };
    const p = buildCoachPrompt(t, 1);
    assert.ok(g.ladder.length >= 2); assert.ok(!p.includes(g.ladder[g.ladder.length - 1]) || g.ladder[g.ladder.length - 1] === g.ladder[0], `${m.id}/${g.id}`);
    if (g.reveal) assert.ok(!p.includes(g.reveal), `${m.id}/${g.id} holds its reveal spot`);
  }
  assert.ok(goals > 50);
});

// ---- the leak check ----
test('numbers are compared the way a person reads them: $20, 20 and 20.00 are the same', () => {
  assert.deepEqual(numbersIn('Charge $20.00 for 2 items, then 3,5'), ['20', '2', '3.5']);
  assert.deepEqual(coachLeaks('Try $3.50 again', ['Set the price to $3.5']), []);
});
test('a reply with a number the hints, task and question do not hold is a leak', () => {
  assert.deepEqual(coachLeaks('Set it to $2.00', ['Look at the line', 'Sell 1 Tadling']), ['2']);
  assert.deepEqual(coachLeaks('Tap the line.', ['x']), []);
  assert.deepEqual(coachLeaks('You said 7, and that is right', ['x', 'I think 7']), []);
});

// ---- asking ----
test('a good reply comes back as the coach, with the unlocked hint in the system prompt and only the three tools', async () => {
  const { f, seen } = fake([ok('Have a look at the line in the cart, it holds the clue.')]);
  const r = await askCoach(f, input());
  assert.equal(r.reply.role, 'coach'); assert.equal(r.reply.source, 'model'); assert.equal(r.reply.level, 1); assert.deepEqual(r.leaked, []);
  const sys = seen[0].messages[0]; assert.equal(sys.role, 'system'); assert.ok(sys.content.includes('Look at the line in the cart.') && !sys.content.includes('$3.50'));
  assert.deepEqual(seen[0].tools.map((t: any) => t.function.name).sort(), [...COACH_TOOL_NAMES].sort());
  assert.equal(r.prepared.system, sys.content); assert.equal(r.prepared.user.text, 'I am stuck');
});
test('a reply that brings in a new number is thrown out and the hint itself is shown', async () => {
  const { f } = fake([ok('Easy: set the price to $3.50.')]);
  const r = await askCoach(f, input({ level: 1 }));
  assert.deepEqual(r.leaked, ['3.5']); assert.equal(r.reply.source, 'hint'); assert.equal(r.reply.text, 'Look at the line in the cart.');
});
test('the same number is fine once the ladder has unlocked it', async () => {
  const { f } = fake([ok('Open the line and set the price to $3.50.')]);
  const r = await askCoach(f, input({ level: 3 })); assert.deepEqual(r.leaked, []); assert.equal(r.reply.source, 'model');
});
test('the trainee\'s own number is allowed back, but a number from nowhere is not', async () => {
  const { f } = fake([ok('You said 4, so check the 9 as well.')]);
  const r = await askCoach(f, input({ text: 'I tried 4' })); assert.deepEqual(r.leaked, ['9']);
});
test('em and en dashes are taken out of the coach reply', async () => {
  const { f } = fake([ok(`Look at the line ${'\u2014'} it holds the clue`)]);
  const r = await askCoach(f, input()); assert.ok(!/[\u2013\u2014]/.test(r.reply.text));
});
test('emails, phone numbers and card numbers typed to the coach never reach the model', async () => {
  const { f, seen } = fake([ok('Look at the line.')]);
  const r = await askCoach(f, input({ text: 'mail jo@example.com or 0412 345 678, card 4111 1111 1111 1111' }));
  const body = JSON.stringify(seen[0].messages); assert.ok(!body.includes('jo@example.com') && !body.includes('345 678') && !body.includes('4111'));
  assert.ok(r.user.note, 'the person is told something was hidden'); assert.ok(Object.keys(r.prepared.masked).length >= 3);
});
test('the coach can look at help pages with a tool and then answer', async () => {
  const page = { id: 'pay/cash', title: 'Cash', summary: 's', tags: [], related: [], updated: '', roles: undefined, sections: { basic: 'Count the cash.', deep: '', advanced: '' } } as any;
  const call = { id: 'c1', type: 'function', function: { name: 'search_docs', arguments: JSON.stringify({ query: 'cash' }) } };
  const { f, seen } = fake([ok(null, [call]), ok('Check the cash help page, then look at the line.')]);
  const tools = makeToolSet({ pages: [page], screens: [], role: 'cashier', contextSize: 8000, tools: coachTools() });
  const r = await askCoach(f, input({ tools }));
  assert.equal(seen.length, 2); assert.equal(seen[1].messages.at(-1).role, 'tool'); assert.equal(r.records.length, 1); assert.equal(r.records[0].name, 'search_docs');
});
test('a model that keeps calling tools is stopped, and that is an error, not an answer', async () => {
  const call = (i: number) => ({ id: `c${i}`, type: 'function', function: { name: 'search_docs', arguments: '{"query":"x"}' } });
  const { f } = fake([ok(null, [call(1), call(2), call(3)]), ok(null, [call(4), call(5), call(6)])]);
  await assert.rejects(() => askCoach(f, input()), (e: unknown) => e instanceof AssistantError && e.kind === 'bad_reply');
});
test('an empty reply is an error', async () => {
  const { f } = fake([ok('   ')]); await assert.rejects(() => askCoach(f, input()), (e: unknown) => e instanceof AssistantError && e.kind === 'bad_reply');
});
test('onPrepared is called before the request, so a failed question can still be logged', async () => {
  let got = false; const f: FetchLike = async () => { assert.ok(got, 'prepared first'); return { ok: false, status: 500, text: async () => 'boom' }; };
  await assert.rejects(() => askCoach(f, input({ onPrepared: () => { got = true; } })));
});
test('the app\'s own reply is the unlocked hint, word for word', () => {
  assert.equal(hintOnlyReply(task, 2, 'x', 1).text, 'The line has a window of its own.'); assert.equal(hintOnlyReply(task, 2, 'x', 1).source, 'hint');
});

// ---- the thread ----
const turn = (id: string, level: number, role: 'user' | 'coach' = 'user'): CoachTurn => ({ id, role, text: `t${id}`, at: 1, level });
test('only turns at or below the rung go back to the model, and only the newest few', () => {
  const h = [turn('a', 1), turn('b', 2), turn('c', 3), turn('d', 1)];
  assert.deepEqual(usableHistory(h, 2).map(t => t.id), ['a', 'b', 'd']);
  assert.equal(usableHistory(Array.from({ length: 20 }, (_, i) => turn(`x${i}`, 1)), 1).length, 6);
});
test('a coach turn from a higher rung is never sent after Start again put the ladder back', async () => {
  const { f, seen } = fake([ok('Look at the line.')]);
  await askCoach(f, input({ level: 1, history: [turn('old-q', 3), turn('old-a', 3, 'coach')] }));
  const body = JSON.stringify(seen[0].messages); assert.ok(!body.includes('told-q') && !body.includes('told-a'));
});
test('threads are kept per goal in memory and drop turns above the rung the person is on', () => {
  clearThreads(); const k = threadKey('m', 'check1', 'g1');
  setThread(k, [turn('a', 1), turn('b', 2), turn('c', 3)]);
  assert.deepEqual(threadAt(k, 2).map(t => t.id), ['a', 'b']); assert.deepEqual(getThread(k).map(t => t.id), ['a', 'b']);
  assert.deepEqual(threadAt(k, 0), []); assert.deepEqual(getThread(k), []);
  assert.notEqual(threadKey('m', 'check1', 'g1'), threadKey('m', 'check2', 'g1'));
});

// ---- the tools ----
test('the coach has the help pages and screens, and nothing that reads shop data, the till, settings or the clock', () => {
  assert.deepEqual(coachTools().map(t => t.def.function.name).sort(), ['read_doc', 'search_docs', 'search_screens']);
  for (const t of coachTools()) assert.equal(t.gate, 'content', t.def.function.name);
  const set = makeToolSet({ pages: [], screens: [], role: 'owner', contextSize: 8000, tools: coachTools() });
  assert.equal(set.tools.length, 3);
});

// ---- the wiring keeps the rules ----
test('the sheet raises the ladder through the app, logs as practice, and the dock only offers it in a Check', () => {
  const sheet = readFileSync('src/ui/CoachSheet.tsx', 'utf8'); const dock = readFileSync('src/ui/TrainingDock.tsx', 'utf8'); const io = readFileSync('src/lib/assistantLogIO.ts', 'utf8');
  assert.match(sheet, /planCoachAsk\(/); assert.match(sheet, /pressHint\(goal\.id, goal\.ladder\)/); assert.match(sheet, /practice: true/); assert.match(sheet, /coachLogSink/);
  assert.match(sheet, /realSignIn\(\)/); assert.match(sheet, /coachTools\(\)/);
  assert.ok(!/takeAssistantData|takeCashState|takeTillState/.test(sheet), 'the coach reads no shop data');
  assert.match(dock, /\{check \? <Pressable onPress=\{\(\) => setCoach\(true\)\}/); assert.match(dock, /coach && check/);
  assert.match(io, /coachLogSink/); assert.match(io, /isTraining\(\)/); // the ordinary sink still stops in practice mode
  const chat = readFileSync('src/screens/Assistant.tsx', 'utf8'); assert.match(chat, /if \(isTraining\(\)\)/); // the Help chat stays off in practice
});
test('no course gives the coach anything: the module type has no field the coach reads but the ladder and the title', () => {
  const src = readFileSync('src/ui/CoachSheet.tsx', 'utf8');
  assert.ok(!/goal\.reveal|goal\.until|goal\.inject|goal\.watch|goal\.taughtBy/.test(src), 'the sheet must not read the answer');
  assert.ok(!/\.reveal|\.until|\.inject|\.watch/.test(readFileSync('src/lib/assistantCoach.ts', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'the logic must not read the answer');
});
