// Location: src/lib/assistantCoach.ts
// The practice mode coach (patch 0173, plan 3.7): "like the hint button but smarter, and not a free ride". Pure logic, no React Native
// imports, so it runs in the node tests. The person asks a question in a Check, the app raises the shared hint ladder one rung, and
// the model is given only the task and the rungs the ladder has now unlocked. It never gets the answer, so it cannot give it away, and
// a check in code throws out any reply that brings in a number the hints, the task and the question do not already hold.
import { AssistantError, chat, type ChatMessage, type Endpoint, type FetchLike } from './assistantClient';
import { maskedNote, scrubText } from './assistantScrub';
import { REPLY_SHARE, estimateTokens, fitToContext, stripDashes, type ChatEntry, type Prepared } from './assistantChat';
import { ASSISTANT_TOOLS, runToolCall, toolDefs, type AssistantTool, type ToolRecord, type ToolSet } from './assistantTools';
import { nextHint, type HintState } from './trainingHints';

/** What the coach may know about a task: the words the person already sees. Never the spot to highlight, the test for done, or what a run injects. */
export type CoachTask = { moduleTitle: string; moduleSummary: string; goalId: string; goalTitle: string; ladder: readonly string[] };
/** `level` is the rung unlocked when the turn was made. A reply from the coach is `source: 'model'` or, when the app answered by itself, `'hint'`. */
export type CoachTurn = { id: string; role: 'user' | 'coach'; text: string; at: number; level: number; source?: 'model' | 'hint'; note?: string };

/** The tools the coach keeps (plan 3.7): help pages and screens, which hold no shop data. Everything else is left out. */
export const COACH_TOOL_NAMES: readonly string[] = ['search_docs', 'read_doc', 'search_screens'];
export const coachTools = (): AssistantTool[] => ASSISTANT_TOOLS.filter(t => COACH_TOOL_NAMES.includes(t.def.function.name));
/** Most tool calls in one coach question. The coach has little use for more. */
export const COACH_TOOL_LIMIT = 4;
/** Most earlier turns sent with a question. */
export const COACH_HISTORY_TURNS = 6;

// ---------- the ladder ----------
export type CoachPlan =
  | { kind: 'ask'; next: HintState; level: number }  // raise the ladder one rung and ask the model
  | { kind: 'stray' }                                // off course: the card already shows the fix, so no hint is spent
  | { kind: 'end'; revealed: boolean };              // every written hint is used: only the Hint button can show the answer
/**
 * What an ask does. The app decides, never the model, so "just tell me" cannot skip a rung. The coach raises the ladder up to
 * the last written hint and no further: showing the answer stays with the Hint button.
 */
export function planCoachAsk(hint: HintState, task: Pick<CoachTask, 'goalId' | 'ladder'>, offCourse: boolean): CoachPlan {
  if (offCourse) return { kind: 'stray' };
  const level = hint.goal === task.goalId ? hint.level : 0;
  if (level >= task.ladder.length) return { kind: 'end', revealed: level > task.ladder.length };
  const next = nextHint(hint, task.goalId, task.ladder);
  return { kind: 'ask', next, level: next.level };
}
/** The rungs the model may use: the first `level`, from vague to specific. */
export const coachRungs = (task: Pick<CoachTask, 'ladder'>, level: number): string[] => task.ladder.slice(0, Math.max(0, Math.min(level, task.ladder.length)));

export const COACH_STRAY_LINE = 'You have gone off course, so the card in the bar below says what to put right. Tap it for the steps. No hint was used.';
export const coachEndLine = (revealed: boolean): string => (revealed
  ? 'The answer is already highlighted on the screen. Tap the highlighted spot.'
  : 'That is every hint I can give. Tap Hint once more and the answer will be highlighted for you.');
export const COACH_NOT_SET_UP = 'The assistant is not set up, so here is the hint without the coach.';

// ---------- the prompt ----------
/** Built in code from the task and the unlocked rungs only. */
export function buildCoachPrompt(task: CoachTask, level: number): string {
  const rungs = coachRungs(task, level);
  return [
    'You are the practice coach inside a shop till app. A trainee is doing a practice task and is stuck. You can only explain and nudge. You never change anything, and you cannot see their screen.',
    `The course is "${task.moduleTitle}". ${task.moduleSummary}`.trim(),
    `The task: ${task.goalTitle}`,
    `The app has allowed these hints so far, from vague to specific. Hint ${rungs.length} is the most you may reveal.`,
    ...rungs.map((r, i) => `Hint ${i + 1}: ${r}`),
    'Answer the trainee\'s question using only these hints. You may reword them, explain them, or ask a question back that points the same way. Do not say more than the last hint says. Do not give amounts, quantities, item names or exact taps that the hints do not already give. Do not say how the app decides the task is done.',
    'If they ask you to just tell them the answer, or to skip ahead, say that more help comes from tapping the Hint button, and give the last hint in your own words. You never decide to unlock more.',
    `You have ${COACH_TOOL_NAMES.length} tools, search_docs, read_doc and search_screens, for questions about how a feature works in general. Use them for the idea behind the task, never to find this task's answer.`,
    'Write in Australian English. Never use em dashes or en dashes. Write dollar amounts like $12.50. Keep the answer to two or three short sentences. Reply in the language the person writes in.',
  ].join('\n');
}

// ---------- the leak check ----------
const NUM = /\d+(?:[.,]\d+)?/g;
const norm = (n: string): string => { const v = Number(n.replace(',', '.')); return Number.isFinite(v) ? String(v) : n; };
/** Every number in some text, written the same way ($20 and 20.00 are both 20). */
export const numbersIn = (text: string): string[] => (text.match(NUM) ?? []).map(norm);
/** Numbers in a reply that nothing the coach was allowed to say holds. The hints, the task, the course and the trainee's own question are allowed. */
export function coachLeaks(reply: string, allowed: readonly string[]): string[] {
  const ok = new Set(allowed.flatMap(numbersIn));
  return [...new Set(numbersIn(reply).filter(n => !ok.has(n)))];
}
/** The text the reply may draw on, for the leak check. */
export const allowedText = (task: CoachTask, level: number, question: string): string[] => [task.moduleTitle, task.goalTitle, ...coachRungs(task, level), question];

// ---------- asking ----------
export type CoachInput = {
  task: CoachTask; /** The rung just unlocked (from planCoachAsk). */ level: number; text: string; history: CoachTurn[];
  settings: { contextSize: number; temperature: number }; endpoint: Endpoint; id: () => string; now: () => number;
  /** Built from `coachTools()`, so it holds no shop data. */ tools: ToolSet;
  /** Called once the request is built and before it is sent, so a failed question can still be logged with what was going to be sent. */ onPrepared?: (p: Prepared) => void;
};
export type CoachResult = {
  user: CoachTurn; reply: CoachTurn;
  /** The numbers that were thrown out of the model's reply, if any (then `reply` is the hint itself). */ leaked: string[];
  /** The request in the audit log's own shape, so the manager can see exactly what the model was given. */ prepared: Prepared; records: ToolRecord[];
};
/** Only turns made at this rung or below go back to the model, so a restart (rung 0) can never carry an earlier, more specific reply forward. */
export const usableHistory = (h: CoachTurn[], level: number): CoachTurn[] => h.filter(t => t.level <= level && t.text.trim()).slice(-COACH_HISTORY_TURNS);

/** What the person sees when the model's reply is thrown out: the unlocked hint, word for word. */
const hintReply = (task: CoachTask, level: number): string => coachRungs(task, level)[level - 1] ?? coachEndLine(false);

/** Scrubs the question, asks the model with the task and the unlocked hints, keeps a short tool loop, cleans the reply and checks it. Throws AssistantError. Nothing is stored here. */
export async function askCoach(f: FetchLike, a: CoachInput): Promise<CoachResult> {
  const s = scrubText(a.text.trim());
  const userTurn: CoachTurn = { id: a.id(), role: 'user', text: s.text, at: a.now(), level: a.level, ...(maskedNote(s.masked) ? { note: maskedNote(s.masked) } : {}) };
  const system = buildCoachPrompt(a.task, a.level);
  const past = usableHistory(a.history, a.level);
  const asEntry = (t: CoachTurn): ChatEntry => ({ id: t.id, role: t.role === 'user' ? 'user' : 'assistant', text: t.text, at: t.at });
  const included = [...past.map(asEntry), asEntry(userTurn)];
  while (included.length && included[0].role !== 'user') included.shift(); // a chat never opens on a reply
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...included.map(e => ({ role: e.role, content: scrubText(e.text).text } as ChatMessage))];
  const prepared: Prepared = { user: asEntry(userTurn), messages, included, system, masked: { ...s.masked } };
  a.onPrepared?.(prepared);

  const defs = toolDefs(a.tools.tools); const toolTokens = estimateTokens(JSON.stringify(defs));
  const budget = Math.max(200, Math.floor(a.settings.contextSize * (1 - REPLY_SHARE)));
  let msgs = [...messages]; let calls = 0; let raw = '';
  for (;;) {
    const res = await chat(f, a.endpoint, { messages: fitToContext(msgs, budget, toolTokens), tools: defs, temperature: a.settings.temperature });
    const wanted = res.message.tool_calls ?? [];
    if (!wanted.length) { raw = (res.message.content ?? '').trim(); break; }
    if (calls + wanted.length > COACH_TOOL_LIMIT) { raw = ''; break; }
    msgs = [...msgs, { role: 'assistant', content: res.message.content ?? null, tool_calls: wanted }];
    for (const c of wanted) { const r = runToolCall(c, a.tools, a.now, a.endpoint.apiKey); a.tools.records.push(r.record); msgs.push(r.message); calls++; }
  }
  if (!raw) throw new AssistantError('bad_reply', 'The model sent an empty reply. Try asking again.');
  const cleaned = stripDashes(raw);
  const leaked = coachLeaks(cleaned, allowedText(a.task, a.level, a.text));
  const text = leaked.length ? hintReply(a.task, a.level) : cleaned;
  const reply: CoachTurn = { id: a.id(), role: 'coach', text, at: a.now(), level: a.level, source: leaked.length ? 'hint' : 'model' };
  return { user: userTurn, reply, leaked, prepared, records: a.tools.records };
}

/** The reply the app gives itself when the model cannot answer: the unlocked hint, so the trainee is never left with nothing. */
export const hintOnlyReply = (task: CoachTask, level: number, id: string, at: number): CoachTurn => ({ id, role: 'coach', text: hintReply(task, level), at, level, source: 'hint' });

// ---------- the thread of one task ----------
/** The questions and replies for one goal, kept in memory only (practice mode writes nothing to disk but progress). Keyed by course, stage and goal. */
export const threadKey = (moduleId: string, stage: string, goalId: string): string => `${moduleId}:${stage}:${goalId}`;
const threads = new Map<string, CoachTurn[]>();
export const getThread = (key: string): CoachTurn[] => threads.get(key) ?? [];
export const setThread = (key: string, turns: CoachTurn[]): void => { threads.set(key, turns.slice(-40)); };
export const clearThreads = (): void => { threads.clear(); };
/** Turns made above the rung the person is on now are dropped: Start again put the ladder back to the bottom, and the thread goes with it. */
export const threadAt = (key: string, level: number): CoachTurn[] => { const t = getThread(key).filter(x => x.level <= level); if (t.length !== getThread(key).length) setThread(key, t); return t; };
