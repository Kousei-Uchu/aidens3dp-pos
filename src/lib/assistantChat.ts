// Location: src/lib/assistantChat.ts
// The Help chatbot's chat logic (patch 0151): what is sent, what is shown, what is kept. Pure logic, no React Native imports,
// so it runs in the node tests. The tools (assistantTools.ts) let it look at the help pages and the app's screens, and nothing
// else: it knows nothing about the shop's data, and it only sees what the cashier types and the earlier messages of the same chat.
import { AssistantError, chat, redactSecrets, type AssistantErrorKind, type ChatMessage, type Endpoint, type FetchLike } from './assistantClient';
import { maskedNote, scrubText, type MaskKind } from './assistantScrub';
import { CATEGORIES, FAIL_CLOSED_POLICY, restricted, type Category, type GatePolicy } from './assistantGate';
import { MAX_LINKS, runToolCall, toolDefs, visiblePages, type ChatLink, type ToolSet } from './assistantTools';

// ---------- the small scrubber ----------
// The scrubber moved to assistantScrub.ts in patch 0161 (the data gate uses it too). It is still re-exported here, so the chat code and its tests are unchanged.
export { luhnOk, maskedNote, MASK_WORD, scrubText, type MaskKind, type Scrubbed } from './assistantScrub';

// ---------- the dash rule ----------
/** Models use em and en dashes a lot and a prompt alone does not stop it, so replies are cleaned before they are shown. */
export function stripDashes(text: string): string {
  return (text ?? '')
    .replace(/(\d)\s*\u2013\s*(\d)/g, '$1 to $2')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/,\s*,/g, ',');
}

// ---------- the prompt ----------
export type Detail = 'short' | 'more';
/** Built in code. It never names a screen, feature or role, so there is nothing in it to leak. Tools will add to it in later patches. */
export function buildSystemPrompt(detail: Detail = 'short', withTools = false): string {
  const lines = [
    'You are the help assistant inside a shop till app, used by shop staff.',
    'You can only read and explain. You never change anything: no prices, refunds, carts, stock, customers or settings.',
    ...(withTools ? [
      'You can look at products, prices, stock levels, sales totals, orders, deals, customers and gift card activity with your tools. You cannot see what is left on a gift card. Do not guess it. If asked, say you cannot look that up.',
    ] : [
      'You have no access to the shop\'s data in this version. You cannot see products, prices, stock, customers, orders or sales. Do not guess them. If asked, say you cannot look that up yet.',
    ]),
    ...(withTools ? [
      'You have thirteen tools. search_docs finds the till\'s help pages and read_doc reads one. search_screens finds a screen by name or purpose and gives the taps to open it. show_link puts a button under your reply that opens a help page or a screen. show_guide puts a "Guide me" button under your reply that points at each tap, one at a time, to reach a screen. current_time gives today\'s date and the time on the till. Use it before any question about today, yesterday, this week or this month, and never guess the date. For any question about how the app works or where something is, search first. For how to do something, read the best help page before you answer.',
      'For the shop\'s own figures, use the data tools. find_products gives the price and stock of a product and its variations, by name, SKU, barcode or category. stock_levels says what is low, out of stock or oversold, and how much stock a category has. Never count stock yourself: use stock_levels. sales_report gives totals for a period, already added up, and how many of an item sold. find_orders finds sales and refunds. list_deals lists the deals and discounts. find_customers finds a customer. gift_card_activity shows gift cards sold and paid with. Never add up figures yourself: use sales_report. Give money as the tool wrote it.',
      'The data tools only know what is saved on this till. If a tool says something is hidden by the shop\'s privacy rules, say you cannot show it. Never guess it, and never repeat details from earlier in the chat that a tool has now hidden.',
      'Use show_link for the one or two best places only, and only after a search gave you the id. Use show_guide only when the person asks to be shown, guided or walked to a screen, and search_screens marked it can_guide. The button is shown for you, so never write a link, an id or a page id in your reply.',
      'Answer only from what the tools return. If they return nothing useful, say "I couldn\'t find anything on that." Do not fill the gap with general knowledge about how other shops or tills work.',
      'Say which help page you used, by its title. Call a screen by the name the tool gives it, and give only the taps it lists. Do not make up page names, screens, buttons or steps.',
    ] : [
      'Answer only from what the person has told you in this chat. If you do not know, say so plainly. Do not fill the gap with general knowledge about how other shops or tills work.',
    ]),
    'Write in Australian English. Never use em dashes or en dashes. Write dollar amounts like $12.50.',
    'Match the length of your answer to the size of the question: a sentence or two for a simple question, a fuller answer with steps for a complex one. Do not give an essay for a simple question, and do not oversimplify a complex one.',
    'Reply in the language the person writes in.',
  ];
  if (detail === 'more') lines.push('The person asked for more detail. Give a fuller answer with steps where they help.');
  return lines.join('\n');
}

// ---------- history ----------
/** `links` are buttons shown under a reply (patch 0159), never sent to the model: only the text is. `offline` marks the entry that stands in for a reply when the model could not answer (patch 0160): a list of matches from the screens and help pages, searched again each time it is shown. */
/**
 * `used` (patch 0161) says which categories of shop data the reply was built from. It is kept so that, if the endpoint or the
 * toggles later stop one of them being sent, the reply and its question are left out of what the model is given.
 */
export type ChatEntry = { id: string; role: 'user' | 'assistant'; text: string; at: number; note?: string; links?: ChatLink[]; offline?: true; used?: Category[] };
export const HISTORY_CAP = 200;
export const historyKey = (staffId: string | undefined): string => `assistant.history.v1.${staffId && staffId.trim() ? staffId : 'owner'}`;

/** Buttons read back from storage: well formed ones only, at most MAX_LINKS. Whether each still works is checked when it is drawn. */
export function readLinks(raw: unknown): ChatLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatLink[] = [];
  for (const l of raw) { const o = l as Record<string, unknown> | null; if (o && typeof o === 'object' && (o.kind === 'doc' || o.kind === 'screen' || o.kind === 'guide') && typeof o.id === 'string' && o.id && typeof o.label === 'string' && o.label && out.length < MAX_LINKS) out.push({ kind: o.kind, id: o.id, label: o.label.slice(0, 120) }); }
  return out;
}

/** Anything read back from storage is untrusted: keep well formed entries only, newest 200. */
export function readHistory(raw: unknown): ChatEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if ((o.role !== 'user' && o.role !== 'assistant') || typeof o.text !== 'string' || typeof o.id !== 'string') continue;
    const links = o.role === 'assistant' ? readLinks(o.links) : [];
    const used = o.role === 'assistant' && Array.isArray(o.used) ? CATEGORIES.filter(c => (o.used as unknown[]).includes(c)) : [];
    out.push({ id: o.id, role: o.role, text: o.text, at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0, ...(typeof o.note === 'string' && o.note ? { note: o.note } : {}), ...(links.length ? { links } : {}), ...(o.role === 'assistant' && o.offline === true ? { offline: true as const } : {}), ...(used.length ? { used } : {}) });
  }
  return capHistory(out);
}
/**
 * An offline entry is only meaningful straight after the question it answers, because its list is searched for from that question.
 * One that has lost its question (the oldest messages were dropped, or storage was edited) is removed.
 */
export function tidyOffline(h: ChatEntry[]): ChatEntry[] {
  return h.filter((e, i) => !e.offline || (i > 0 && h[i - 1].role === 'user' && !h[i - 1].offline));
}
/** The oldest messages go first, so the history cannot grow without limit on an iPad. */
export const capHistory = (h: ChatEntry[], cap = HISTORY_CAP): ChatEntry[] => tidyOffline(h.length > cap ? h.slice(h.length - cap) : h);
/**
 * What the model gets to see of the history. A question that only got an offline list was never answered, so it and its list stay
 * out: the model would otherwise read a question with no reply, and some chat templates refuse two user messages in a row.
 */
export function forModel(h: ChatEntry[], policy: GatePolicy = FAIL_CLOSED_POLICY): ChatEntry[] {
  const out: ChatEntry[] = [];
  for (const e of tidyOffline(h)) {
    // A reply built from data this endpoint may no longer be sent (the address changed to a remote one, or a toggle was switched) goes out with its question (patch 0161).
    if (e.offline || (e.role === 'assistant' && restricted(e.used, policy))) { if (out.length && out[out.length - 1].role === 'user') out.pop(); continue; }
    out.push(e);
  }
  return out;
}
/** Takes one exchange out of the history: the question with this id, and the offline list straight after it if it has one. Used when a retry replaces it. */
export function withoutExchange(h: ChatEntry[], userId: string | undefined): ChatEntry[] {
  if (!userId) return h;
  const i = h.findIndex(e => e.id === userId && e.role === 'user'); if (i < 0) return h;
  return h.filter((_e, j) => j !== i && !(j === i + 1 && h[j].offline));
}

/** A rough token count. The app cannot see the model's own count, so this errs on the high side (about 3 characters a token). */
export const estimateTokens = (s: string): number => Math.ceil((s ?? '').length / 3) + 4;
/** A share of the context is kept free for the reply. */
export const REPLY_SHARE = 0.25;

export type Masked = Partial<Record<MaskKind, number>>;
const addMasks = (into: Masked, from: Masked): Masked => { for (const k of Object.keys(from) as MaskKind[]) into[k] = (into[k] ?? 0) + (from[k] ?? 0); return into; };
export type BuiltMessages = { messages: ChatMessage[]; /** The history entries behind the non system messages, in order. */ included: ChatEntry[]; /** What the scrubber hid on the history at send time. */ masked: Masked; system: string };

/**
 * The messages sent with the next question: the system prompt, then as many of the newest messages as fit in the context
 * size, oldest dropped first. The scrubber runs over every message again here, so history written earlier never goes out
 * with data the current rules would mask. The newest message is always kept, cut down if it alone is too long.
 * Also says which entries went and what was hidden, for the audit log (patch 0152).
 */
export function buildMessagesDetailed(history: ChatEntry[], detail: Detail, contextSize: number, tools?: ToolSet): BuiltMessages {
  const system: ChatMessage = { role: 'system', content: buildSystemPrompt(detail, !!tools) };
  // The tool definitions are sent with every request and share the context, so they come off what is left for the chat.
  const toolCost = tools ? estimateTokens(JSON.stringify(toolDefs(tools.tools))) : 0;
  const budget = Math.max(200, Math.floor(contextSize * (1 - REPLY_SHARE)) - estimateTokens(system.content ?? '') - toolCost);
  const picked: ChatMessage[] = []; const entries: ChatEntry[] = []; let used = 0;
  history = forModel(history, tools?.ctx.policy);
  for (let i = history.length - 1; i >= 0; i--) {
    let text = scrubText(history[i].text).text;
    let cost = estimateTokens(text);
    if (picked.length === 0 && cost > budget) { text = text.slice(0, Math.max(1, (budget - 4) * 3)); cost = estimateTokens(text); }
    if (used + cost > budget) break;
    picked.unshift({ role: history[i].role, content: text }); entries.unshift(history[i]); used += cost;
  }
  while (picked.length && picked[0].role !== 'user') { picked.shift(); entries.shift(); } // a chat never opens on a reply
  const masked: Masked = {}; for (const e of entries) addMasks(masked, scrubText(e.text).masked);
  return { messages: [system, ...picked], included: entries, masked, system: system.content ?? '' };
}
export const buildMessages = (history: ChatEntry[], detail: Detail, contextSize: number): ChatMessage[] => buildMessagesDetailed(history, detail, contextSize).messages;

// ---------- asking the model ----------
export type AskInput = { history: ChatEntry[]; text: string; detail: Detail; settings: { contextSize: number; temperature: number }; endpoint: Endpoint; id: () => string; now: () => number; /** The tools the model may use for this question. Without it the model has none. */ tools?: ToolSet };
export type AskResult = { user: ChatEntry; reply: ChatEntry };
/** Everything decided before the network call, so the audit log can record a request even when it fails. */
export type Prepared = { user: ChatEntry; messages: ChatMessage[]; included: ChatEntry[]; system: string; /** Hidden in what was typed plus hidden in old history at send time. */ masked: Masked };

/** Scrubs what was typed and builds the request. Nothing is sent or stored here. */
export function prepare(a: AskInput): Prepared {
  const s = scrubText(a.text.trim());
  const user: ChatEntry = { id: a.id(), role: 'user', text: s.text, at: a.now(), ...(maskedNote(s.masked) ? { note: maskedNote(s.masked) } : {}) };
  const b = buildMessagesDetailed([...a.history, user], a.detail, a.settings.contextSize, a.tools);
  return { user, messages: b.messages, included: b.included, system: b.system, masked: addMasks({ ...s.masked }, b.masked) };
}
/** The result that replaces an old tool result when the context is getting full. */
export const DROPPED_RESULT = '{"note":"An earlier result was removed to save space."}';
/**
 * Keeps a long run of tool calls inside the context. If the messages are over the budget, the oldest tool results are
 * replaced by a short note until they fit. The system prompt, the chat and the newest results are never touched.
 */
export function fitToContext(messages: ChatMessage[], budgetTokens: number, toolTokens = 0): ChatMessage[] {
  const out = messages.map(m => ({ ...m }));
  const total = () => out.reduce((n, m) => n + estimateTokens(m.content ?? '') + (m.tool_calls ? estimateTokens(JSON.stringify(m.tool_calls)) : 0), toolTokens);
  const lastTool = out.map(m => m.role).lastIndexOf('tool');
  for (let i = 0; i < out.length && total() > budgetTokens; i++) if (out[i].role === 'tool' && i !== lastTool && out[i].content !== DROPPED_RESULT) out[i].content = DROPPED_RESULT;
  return out;
}
export const limitReply = (limit: number, titles: string[]): string =>
  `I stopped looking after ${limit} lookups without a full answer.${titles.length ? ` The pages I read were: ${titles.join(', ')}.` : ''} Try asking in a smaller piece, or open Help and search there.`;

/** Sends a prepared request and cleans the reply. With tools it keeps going while the model asks for them, up to the limit. Throws AssistantError. */
export async function runPrepared(f: FetchLike, a: AskInput, p: Prepared): Promise<AskResult> {
  const set = a.tools;
  if (!set) {
    const res = await chat(f, a.endpoint, { messages: p.messages, temperature: a.settings.temperature });
    const raw = (res.message.content ?? '').trim();
    if (!raw) throw new AssistantError('bad_reply', 'The model sent an empty reply. Try asking again.');
    return { user: p.user, reply: { id: a.id(), role: 'assistant', text: stripDashes(raw), at: a.now() } };
  }
  const defs = toolDefs(set.tools); const toolTokens = estimateTokens(JSON.stringify(defs));
  const budget = Math.max(200, Math.floor(a.settings.contextSize * (1 - REPLY_SHARE)));
  let messages = [...p.messages]; let calls = 0; let raw = ''; const links: ChatLink[] = []; const used = new Set<Category>();
  for (;;) {
    const res = await chat(f, a.endpoint, { messages: fitToContext(messages, budget, toolTokens), tools: defs, temperature: a.settings.temperature });
    const wanted = res.message.tool_calls ?? [];
    if (!wanted.length) { raw = (res.message.content ?? '').trim(); break; }
    if (calls + wanted.length > set.limit) {
      const titles = new Map(visiblePages(set.ctx).map(x => [x.id, x.title] as const)); const read: string[] = [];
      for (const r of set.records) if (r.name === 'read_doc' && r.ok) { try { const t = titles.get(JSON.parse(r.args).id); if (t && !read.includes(t)) read.push(t); } catch { /* skip */ } }
      raw = limitReply(set.limit, read); break;
    }
    messages = [...messages, { role: 'assistant', content: res.message.content ?? null, tool_calls: wanted }];
    for (const c of wanted) { const r = runToolCall(c, set, a.now, a.endpoint.apiKey); set.records.push(r.record); for (const k of r.record.used ?? []) used.add(k); messages.push(r.message); calls++; if (r.link && links.length < MAX_LINKS && !links.some(l => l.kind === r.link!.kind && l.id === r.link!.id)) links.push(r.link); }
  }
  if (!raw) throw new AssistantError('bad_reply', 'The model sent an empty reply. Try asking again.');
  return { user: p.user, reply: { id: a.id(), role: 'assistant', text: stripDashes(raw), at: a.now(), ...(links.length ? { links } : {}), ...(used.size ? { used: CATEGORIES.filter(c => used.has(c)) } : {}) } };
}
/** Scrubs what was typed, asks the model, cleans the reply. Throws AssistantError. Nothing is stored here. */
export async function ask(f: FetchLike, a: AskInput): Promise<AskResult> { return runPrepared(f, a, prepare(a)); }

// ---------- the error banner ----------
export type Banner = { kind: AssistantErrorKind; title: string; body: string };
const TITLE: Record<AssistantErrorKind, string> = {
  not_set_up: 'The assistant is not set up yet', unreachable: 'Cannot reach the model', timeout: 'The model took too long', key_rejected: 'The model rejected the key',
  model_not_found: 'The model was not found', no_tools: 'This model cannot use tools', bad_address: 'Wrong model address', server_error: 'The model server had a problem', bad_reply: 'The model sent an odd reply',
};
/** What the banner says. The API key never appears in it. */
export function bannerFor(e: unknown, apiKey?: string): Banner {
  const err = e instanceof AssistantError ? e : new AssistantError('server_error', String((e as Error)?.message ?? 'Something went wrong.'));
  return { kind: err.kind, title: TITLE[err.kind], body: redactSecrets(err.message, apiKey) };
}
/** Who gets a button to the model settings. Everyone else is told to ask. */
export const bannerAction = (canEdit: boolean): 'open_settings' | 'ask_manager' => (canEdit ? 'open_settings' : 'ask_manager');
export const ASK_MANAGER_LINE = 'Ask the owner or a manager to check the AI assistant settings.';
/** A retry only helps when waiting or trying again can change something. */
export const canRetry = (k: AssistantErrorKind): boolean => k === 'unreachable' || k === 'timeout' || k === 'server_error' || k === 'bad_reply';

// ---------- who sees it, and when sending is blocked ----------
/** Flipped to true in the audit log viewer patch (0153, built as 0156). The log now has a manager-only viewer, so everyone may use the chat. */
export const ASSISTANT_OPEN_TO_ALL = true;
/** The entry needs a signed in person (history is per staff member), so it is never on the lock screen. */
export function assistantEntryVisible(i: { locked: boolean; canEdit: boolean; openToAll?: boolean }): boolean {
  if (i.locked) return false;
  return (i.openToAll ?? ASSISTANT_OPEN_TO_ALL) || i.canEdit;
}
export const PRACTICE_BLOCK = 'The assistant is switched off in practice mode. Practice mode never sends anything out.';
/** Why sending is blocked right now, or null when it is not. */
export function sendBlock(i: { training: boolean }): string | null { return i.training ? PRACTICE_BLOCK : null; }
