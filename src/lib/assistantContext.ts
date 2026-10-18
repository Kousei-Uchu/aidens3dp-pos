// Location: src/lib/assistantContext.ts
// The assistant's screen and register context (patch 0167, plan 3.2 tool 10): `screen_context`. It tells the model where the
// person was standing when they opened the chat (the tab or page), the signed in role, the display mode and which tabs that
// mode shows, whether checkout is the guided one, whether practice mode is on and which register this is. That is what lets
// it say "tap More" and not "tap Inventory" to someone whose mode hides Inventory, and answer "what is this screen for".
//
// Nothing here reads the app. The chat screen reads the navigation and the person's profile once, when the question is asked,
// and hands this file plain values (a snapshot, like the time in 0166). So it is pure, runs in the node tests, and has nothing
// it could write to. The screen is only named from the list the role may see (visibleScreens in assistantTools.ts), so a page
// the role cannot reach gets exactly the same answer as a page the till cannot name.
import type { ScreenEntry } from './assistantScreens';
import { MODE_LABEL, type UiMode } from './uiMode';

/** The names the tab bar shows. A test pins these to the tab names in the app graph, so they cannot drift. */
export const TAB_LABELS: Readonly<Record<string, string>> = { checkout: 'Checkout', inventory: 'Inventory', transactions: 'Transactions', notifications: 'Notifications', more: 'More' };

/** What was true on the till when the question was asked. Plain values only. */
export type RegisterContext = {
  /** The graph id of the tab or page the person was on before they opened Help and the chat. `null` when the page is not one the till can name. */
  screen: string | null;
  /** The tab underneath, as the app calls it (`checkout`, `more`, ...). Only reported when `screen` is known, because a page above another tab would make it misleading. */
  tab: string;
  /** The person's display mode (`standard`, `simple`, `minimal` or `custom`). */
  mode: string;
  /** The tabs that mode shows, as tab ids. */
  tabs: string[];
  /** Checkout is the one question at a time flow. */
  guided: boolean;
  /** Practice mode is on. The chat is blocked then, so a real question always has this false. */
  practice: boolean;
  /** The name the shop gave this register. */
  register?: string;
};

/** Pages that are the way to the chat, not somewhere the person was working. They are skipped to find where they were standing. */
const WAY_TO_CHAT: readonly string[] = ['assistant', 'help'];

/**
 * The page the person was on before they opened Help and the chat. The chat opens from Help, and Help from a page or from More, so
 * the last pages on the stack are Help and the chat itself; skipping them leaves the page beneath, or none, which means the tab.
 */
export function standingOn(stack: readonly { name: string }[]): string | undefined {
  let i = stack.length; while (i > 0 && WAY_TO_CHAT.includes(stack[i - 1].name)) i--;
  return i > 0 ? stack[i - 1].name : undefined;
}

/**
 * Builds the context from what the chat screen can see. `screenOfRoute` is the app graph's name for a pushed page (it returns
 * undefined for a page the graph does not know), passed in so this file stays free of the graph.
 */
export function registerContext(o: {
  tab: string; stack: readonly { name: string }[]; screenOfRoute: (route: string) => string | undefined;
  mode: string; tabs: readonly string[]; guided: boolean; practice: boolean; register?: string;
}): RegisterContext {
  const route = standingOn(o.stack);
  const screen = route === undefined ? `tab_${o.tab}` : (o.screenOfRoute(route) ?? null);
  const reg = (o.register ?? '').trim();
  return { screen, tab: o.tab, mode: o.mode, tabs: [...o.tabs], guided: !!o.guided, practice: !!o.practice, ...(reg ? { register: reg.slice(0, 60) } : {}) };
}

const NOT_KNOWN_HERE = 'Where the person is on the till is not known here.';
const NO_PAGE = 'The page the person is on is not one the till can name, so say you cannot tell which page it is.';
const NOTE = 'This is where the person was when they opened the chat. A guide always starts from the Checkout tab. Only the tabs listed are on their tab bar.';

/**
 * What the model is told. `entry` is the screen for `where.screen` when this role may see it, already filtered by the caller; a
 * missing entry gives the same answer however it came about (unknown page, or a page this role cannot reach).
 */
export function contextInfo(role: string, where: RegisterContext | undefined, entry: ScreenEntry | undefined): Record<string, unknown> {
  if (!where) return { role, note: NOT_KNOWN_HERE };
  const base = {
    role,
    display_mode: MODE_LABEL[where.mode as UiMode] ?? where.mode,
    tabs_shown: where.tabs.map(t => TAB_LABELS[t] ?? t),
    guided_checkout: where.guided,
    practice_mode: where.practice,
    ...(where.register ? { register: where.register } : {}),
  };
  if (!entry) return { ...base, note: NO_PAGE };
  return { ...base, selected_tab: TAB_LABELS[where.tab] ?? where.tab, screen: { name: entry.name, kind: entry.kind, summary: entry.summary }, note: NOTE };
}
