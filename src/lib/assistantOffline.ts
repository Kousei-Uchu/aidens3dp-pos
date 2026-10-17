// Location: src/lib/assistantOffline.ts
// The assistant's offline mode (patch 0160, plan 3.3): when the model cannot answer, the chat still searches the screens and the
// help pages, with no model, and shows the matches as a list. It is the same two searches the model's tools use
// (`searchScreenList`, `searchDocPages`), so the role filter in 3.4 applies here too: a role is never shown a screen or a page it
// cannot use, and a question about one gets the same reply as a question about something that does not exist.
//
// Pure, so it runs in the node tests. Nothing here talks to a model or to the network.
import { maskedNote, scrubText, type ChatEntry } from './assistantChat';
import { searchDocPages, searchScreenList, type DocHit, type ScreenHit, type ToolContext } from './assistantTools';

/** What the pages and screens are searched with. A role sees only its own. */
export type OfflineCtx = Pick<ToolContext, 'pages' | 'screens' | 'role'>;
export type OfflineHits = { screens: ScreenHit[]; pages: DocHit[] };

/** Said above the list, so nobody mistakes a list of matches for an answer. */
export const OFFLINE_LABEL = 'Model offline, showing search results.';
export const OFFLINE_EMPTY = 'I couldn\'t find anything on that. Try different key words, or open Help and look through the contents.';
export const OFFLINE_MAX = 5;

/** The scrubber's tags ("[card number]") are not words the person meant, so they are not searched for. */
export const offlineQuery = (text: string): string => (text ?? '').replace(/\[(?:email address|phone number|card number|key|key or token)\]/g, ' ').replace(/\s+/g, ' ').trim();

export const hasOfflineHits = (h: OfflineHits): boolean => h.screens.length > 0 || h.pages.length > 0;

/**
 * Searches the screens and the help pages for what was typed. Only what this role may see is searched. A search that fails
 * for any reason is an empty list, because this runs when something has already gone wrong and must not add a second error.
 */
export function offlineSearch(ctx: OfflineCtx, text: string): OfflineHits {
  const q = offlineQuery(text); if (!q) return { screens: [], pages: [] };
  let screens: ScreenHit[] = []; let pages: DocHit[] = [];
  try { screens = searchScreenList(ctx, q, OFFLINE_MAX); } catch { screens = []; }
  try { pages = searchDocPages(ctx, q, OFFLINE_MAX); } catch { pages = []; }
  return { screens, pages };
}

/** The marker that goes in the history in place of a reply. Its list is searched again each time it is shown, from the question before it. */
export const makeOfflineEntry = (id: string, at: number): ChatEntry => ({ id, role: 'assistant', text: OFFLINE_LABEL, at, offline: true });

export type OfflineExchange = { user: ChatEntry; reply: ChatEntry; hits: OfflineHits };
/**
 * What the chat adds when the model could not answer: the question (hidden by the scrubber, as always) and the marker that stands
 * in for a reply. Only the question is stored. The matches are found again each time the chat is shown, with the role of whoever
 * is signed in then, so a role that loses access to something stops being shown it.
 */
export function offlineExchange(i: { text: string; ctx: OfflineCtx; id: () => string; now: () => number }): OfflineExchange {
  const s = scrubText((i.text ?? '').trim());
  const user: ChatEntry = { id: i.id(), role: 'user', text: s.text, at: i.now(), ...(maskedNote(s.masked) ? { note: maskedNote(s.masked) } : {}) };
  return { user, reply: makeOfflineEntry(i.id(), i.now()), hits: offlineSearch(i.ctx, s.text) };
}
