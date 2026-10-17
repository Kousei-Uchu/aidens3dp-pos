// Location: src/lib/assistantChat.ts
// The Help chatbot's chat logic (patch 0151): what is sent, what is shown, what is kept. Pure logic, no React Native imports,
// so it runs in the node tests. There are no tools yet, so the model knows nothing about the shop: it only sees what the
// cashier types and the earlier messages of the same chat.
import { AssistantError, chat, redactSecrets, type AssistantErrorKind, type ChatMessage, type Endpoint, type FetchLike } from './assistantClient';

// ---------- the small scrubber ----------
// The full data gate arrives in patch 5. Until then this keeps the obvious things off the wire, on every endpoint:
// a pasted email address, phone number, card number or key never leaves the iPad, so it cannot reach a remote server.
export type MaskKind = 'email' | 'phone' | 'card' | 'key';
export type Scrubbed = { text: string; masked: Partial<Record<MaskKind, number>> };
export const MASK_WORD: Record<MaskKind, [string, string]> = { email: ['email address', 'email addresses'], phone: ['phone number', 'phone numbers'], card: ['card number', 'card numbers'], key: ['key or token', 'keys or tokens'] };

/** The Luhn check, used so a long number is only masked as a card when it can be one. */
export function luhnOk(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0; let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) { let d = digits.charCodeAt(i) - 48; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
  return sum % 10 === 0;
}

const CARD_RUN = /(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const AU_PHONE = /(?<![\w])(?:\+61|0)[2-478](?:[ -]?\d){8}(?![\d])/g;
const INTL_PHONE = /(?<![\w])\+\d{1,3}(?:[ -]?\d){7,12}(?![\d])/g;
const LONG_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g;

export function scrubText(input: string): Scrubbed {
  const masked: Partial<Record<MaskKind, number>> = {};
  const bump = (k: MaskKind) => { masked[k] = (masked[k] ?? 0) + 1; };
  let t = input ?? '';
  const before = t;
  t = redactSecrets(t); if (t !== before) { const n = (before.match(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi) ?? []).length; for (let i = 0; i < Math.max(1, n); i++) bump('key'); }
  t = t.replace(CARD_RUN, m => { if (luhnOk(m.replace(/[ -]/g, ''))) { bump('card'); return '[card number]'; } return m; });
  t = t.replace(EMAIL, () => { bump('email'); return '[email address]'; });
  t = t.replace(AU_PHONE, () => { bump('phone'); return '[phone number]'; });
  t = t.replace(INTL_PHONE, () => { bump('phone'); return '[phone number]'; });
  t = t.replace(LONG_TOKEN, m => { if (/[A-Za-z]/.test(m) && /\d/.test(m)) { bump('key'); return '[key]'; } return m; });
  return { text: t, masked };
}

/** "Hidden before sending: 1 email address and 2 phone numbers." Empty when nothing was masked. */
export function maskedNote(masked: Partial<Record<MaskKind, number>>): string {
  const parts = (Object.keys(MASK_WORD) as MaskKind[]).filter(k => (masked[k] ?? 0) > 0).map(k => `${masked[k]} ${MASK_WORD[k][masked[k] === 1 ? 0 : 1]}`);
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Hidden before sending: ${list}.`;
}

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
export function buildSystemPrompt(detail: Detail = 'short'): string {
  const lines = [
    'You are the help assistant inside a shop till app, used by shop staff.',
    'You can only read and explain. You never change anything: no prices, refunds, carts, stock, customers or settings.',
    'You have no access to the shop\'s data in this version. You cannot see products, prices, stock, customers, orders or sales. Do not guess them. If asked, say you cannot look that up yet.',
    'Answer only from what the person has told you in this chat. If you do not know, say so plainly. Do not fill the gap with general knowledge about how other shops or tills work.',
    'Write in Australian English. Never use em dashes or en dashes. Write dollar amounts like $12.50.',
    'Match the length of your answer to the size of the question: a sentence or two for a simple question, a fuller answer with steps for a complex one. Do not give an essay for a simple question, and do not oversimplify a complex one.',
    'Reply in the language the person writes in.',
  ];
  if (detail === 'more') lines.push('The person asked for more detail. Give a fuller answer with steps where they help.');
  return lines.join('\n');
}

// ---------- history ----------
export type ChatEntry = { id: string; role: 'user' | 'assistant'; text: string; at: number; note?: string };
export const HISTORY_CAP = 200;
export const historyKey = (staffId: string | undefined): string => `assistant.history.v1.${staffId && staffId.trim() ? staffId : 'owner'}`;

/** Anything read back from storage is untrusted: keep well formed entries only, newest 200. */
export function readHistory(raw: unknown): ChatEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if ((o.role !== 'user' && o.role !== 'assistant') || typeof o.text !== 'string' || typeof o.id !== 'string') continue;
    out.push({ id: o.id, role: o.role, text: o.text, at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0, ...(typeof o.note === 'string' && o.note ? { note: o.note } : {}) });
  }
  return capHistory(out);
}
/** The oldest messages go first, so the history cannot grow without limit on an iPad. */
export const capHistory = (h: ChatEntry[], cap = HISTORY_CAP): ChatEntry[] => (h.length > cap ? h.slice(h.length - cap) : h);

/** A rough token count. The app cannot see the model's own count, so this errs on the high side (about 3 characters a token). */
export const estimateTokens = (s: string): number => Math.ceil((s ?? '').length / 3) + 4;
/** A share of the context is kept free for the reply. */
export const REPLY_SHARE = 0.25;

/**
 * The messages sent with the next question: the system prompt, then as many of the newest messages as fit in the context
 * size, oldest dropped first. The scrubber runs over every message again here, so history written earlier never goes out
 * with data the current rules would mask. The newest message is always kept, cut down if it alone is too long.
 */
export function buildMessages(history: ChatEntry[], detail: Detail, contextSize: number): ChatMessage[] {
  const system: ChatMessage = { role: 'system', content: buildSystemPrompt(detail) };
  const budget = Math.max(200, Math.floor(contextSize * (1 - REPLY_SHARE)) - estimateTokens(system.content ?? ''));
  const picked: ChatMessage[] = []; let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    let text = scrubText(history[i].text).text;
    let cost = estimateTokens(text);
    if (picked.length === 0 && cost > budget) { text = text.slice(0, Math.max(1, (budget - 4) * 3)); cost = estimateTokens(text); }
    if (used + cost > budget) break;
    picked.unshift({ role: history[i].role, content: text }); used += cost;
  }
  while (picked.length && picked[0].role !== 'user') picked.shift(); // a chat never opens on a reply
  return [system, ...picked];
}

// ---------- asking the model ----------
export type AskInput = { history: ChatEntry[]; text: string; detail: Detail; settings: { contextSize: number; temperature: number }; endpoint: Endpoint; id: () => string; now: () => number };
export type AskResult = { user: ChatEntry; reply: ChatEntry };

/** Scrubs what was typed, asks the model, cleans the reply. Throws AssistantError. Nothing is stored here. */
export async function ask(f: FetchLike, a: AskInput): Promise<AskResult> {
  const s = scrubText(a.text.trim());
  const user: ChatEntry = { id: a.id(), role: 'user', text: s.text, at: a.now(), ...(maskedNote(s.masked) ? { note: maskedNote(s.masked) } : {}) };
  const messages = buildMessages([...a.history, user], a.detail, a.settings.contextSize);
  const res = await chat(f, a.endpoint, { messages, temperature: a.settings.temperature });
  const raw = (res.message.content ?? '').trim();
  if (!raw) throw new AssistantError('bad_reply', 'The model sent an empty reply. Try asking again.');
  return { user, reply: { id: a.id(), role: 'assistant', text: stripDashes(raw), at: a.now() } };
}

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
/** Flipped to true in the audit log patch (3 in the plan). Until then only people who may edit the assistant settings see the entry. */
export const ASSISTANT_OPEN_TO_ALL = false;
/** The entry needs a signed in person (history is per staff member), so it is never on the lock screen. */
export function assistantEntryVisible(i: { locked: boolean; canEdit: boolean; openToAll?: boolean }): boolean {
  if (i.locked) return false;
  return (i.openToAll ?? ASSISTANT_OPEN_TO_ALL) || i.canEdit;
}
export const PRACTICE_BLOCK = 'The assistant is switched off in practice mode. Practice mode never sends anything out.';
/** Why sending is blocked right now, or null when it is not. */
export function sendBlock(i: { training: boolean }): string | null { return i.training ? PRACTICE_BLOCK : null; }
