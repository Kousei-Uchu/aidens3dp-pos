// Location: src/lib/assistantScreens.ts
// The screens the assistant may tell people about (patch 0158). It reads the app graph (src/app.navgraph) once and turns it into
// a plain list: what each screen is called, what it is for, which roles can get to it, and how to open it from the Checkout tab.
// The assistant's tools get this list and never touch the graph themselves, so they stay pure and cannot change anything.
//
// Roles are worked out by walking the graph once per role, dropping every transition and screen that role may not use. A
// screen only lists a role when that role can really get there. That is stricter than the `roles` on the screen alone: the
// Settings page has no `roles` of its own, but the transition into it does, so a cashier never reaches it.
import { findReachable, planRoute, type Edge, type JsonObject } from 'routegraph';
import { metaInScope, scopeForReal, spotOfPlanStep, tree } from './appGraph';
import { PAGE_ROLES } from './helpDocs';
import { SPOT_SCREEN } from './appControls';
import { isKnownSpot } from './trainingSpots';

/** How a button can open a screen (patch 0159): a tab to switch to, or a page to push. Only these two can be opened without knowing anything else. */
export type ScreenTarget = { tab: string } | { route: string };
/**
 * Pages that need something the link cannot give: a cart or an item to work on, a lesson to run, or nothing useful (the chat
 * itself). They are still searchable, so the assistant can say where they are, but no button is made for them.
 */
export const NOT_LINKABLE_ROUTES: readonly string[] = ['pay', 'cart', 'createItem', 'editItem', 'assistant', 'trainingRun', 'terminalPlay'];

/** One tap on the way to a screen (patch 0162): the control to point at and the words to say while pointing. */
export type GuideStep = { spot: string; say: string };

/** A walk that was dropped because it taps a control that is not a real spot in the UI (patch 0162). Reported by buildScreenIndex so a test can pin the list. */
export type GuideGap = { screen: string; role: string; spot: string };

/** One screen, ready for the assistant's search. */
export type ScreenEntry = {
  id: string;
  name: string;
  /** What sort of place it is, in the words people use: tab, view, page or window. */
  kind: string;
  summary: string;
  keywords: string[];
  /** The roles that can get to it. */
  roles: string[];
  /** How to open it from the Checkout tab, for each role that can. Missing when no walk could be planned. */
  steps: Partial<Record<string, string[]>>;
  /**
   * The taps from the Checkout tab as controls to point at, for each role that can get there (patch 0162). Left out when the walk is empty, when any
   * tap has no control or no words, or when the walk goes through a window: windows are drawn above everything, so a pointer cannot be shown
   * inside one yet. Such a screen can still be explained in words from `steps`.
   */
  walk?: Partial<Record<string, GuideStep[]>>;
  /** For a view (which has no tab or page of its own to arrive at): controls that live on it, so the guide can see the person has arrived when one is on screen. */
  arrive?: string[];
  /** How a button opens it. Missing for views and windows (they only exist on top of something else) and for the pages in NOT_LINKABLE_ROUTES. */
  target?: ScreenTarget;
};

/** Where every walk starts. Checkout is the screen the till opens on. */
export const HOME_SCREEN = 'tab_checkout';
export const HOME_NAME = 'Checkout';

/** Stand-in values for the graph's variables. A walk to a cart line's window needs a line key to be planned; the words said do not depend on which key. */
const PLAN_VARIABLES = { ITEM_KEY: 'item' };

/** The controls that live on a screen, from the control table. A guide to a view is finished when one of them is on screen. */
const arriveSpots = (screen: string): string[] => Object.entries(SPOT_SCREEN).filter(([, scr]) => scr === screen).map(([spot]) => spot);

/** The word for a screen kind that a cashier would use. Sheets are shown as windows, which is what the app calls them. */
const KIND_WORD: Record<string, string> = { tab: 'tab', view: 'view', page: 'page', sheet: 'window', overlay: 'overlay' };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const roleOk = (meta: JsonObject, role: string): boolean => { const r = strings(meta.roles); return r.length === 0 || r.includes(role); };

/**
 * Builds the list. Overlays (sign in, the screensaver, the cameras) are left out because nobody goes looking for them, and so
 * is every screen that only exists in a practice lesson. Screens made while the till runs (one window per cart line) are not
 * on the graph yet, so they are not here either.
 */
export function buildScreenIndex(roles: readonly string[] = PAGE_ROLES, gaps?: GuideGap[]): ScreenEntry[] {
  const t = tree(); if (!t || !t.hasScreen(HOME_SCREEN)) return [];
  const scope = scopeForReal();
  const reach: Record<string, Set<string>> = {}; const steps: Record<string, Map<string, string[]>> = {}; const walks: Record<string, Map<string, GuideStep[]>> = {};
  for (const role of roles) {
    const edgeFilter = (e: Edge): boolean => {
      const to = t.screen(e.to);
      return !!to && metaInScope(to.meta, scope) && metaInScope(e.meta, scope) && roleOk(to.meta, role) && roleOk(e.meta, role);
    };
    let ids: string[] = []; try { ids = findReachable(t, HOME_SCREEN, { edgeFilter }); } catch { ids = []; }
    reach[role] = new Set(ids); steps[role] = new Map(); walks[role] = new Map();
    for (const id of ids) {
      if (id === HOME_SCREEN) { steps[role].set(id, []); continue; }
      try {
        const plan = planRoute(t, HOME_SCREEN, [{ screen: id }], { edgeFilter, variables: PLAN_VARIABLES });
        if (!plan.ok) continue;
        const said = plan.instructions.steps.map(s => t.edge(s.edge)?.meta.say).filter((x): x is string => typeof x === 'string' && x.length > 0);
        if (said.length) steps[role].set(id, said);
        // The same walk as controls to point at. Any tap without a control or words, or into a window, leaves the screen without a guide.
        const walk: GuideStep[] = []; let guidable = plan.instructions.steps.length > 0;
        for (const s of plan.instructions.steps) {
          const e = t.edge(s.edge); const spot = spotOfPlanStep(s); const say = typeof e?.meta.say === 'string' ? e.meta.say : '';
          const into = e ? t.screen(e.to) : undefined; const kind = String(into?.meta.kind ?? '');
          if (!spot || !say || kind === 'sheet' || kind === 'overlay') { guidable = false; break; }
          // The graph can name a control the UI has no spot for (a row with no id, a button repeated on every card). A walk to it could only ever say "lost".
          if (!isKnownSpot(spot)) { gaps?.push({ screen: id, role, spot }); guidable = false; break; }
          walk.push({ spot, say });
        }
        if (guidable) walks[role].set(id, walk);
      } catch { /* a screen that cannot be planned just has no steps */ }
    }
  }
  const out: ScreenEntry[] = [];
  for (const s of t.screens.values()) {
    const kind = String(s.meta.kind ?? '');
    if (!KIND_WORD[kind] || kind === 'overlay') continue;
    if (!metaInScope(s.meta, scope)) continue;
    const who = roles.filter(r => reach[r]?.has(s.id)); if (!who.length) continue;
    const label = typeof s.meta.label === 'string' && s.meta.label ? s.meta.label : s.name;
    const byRole: Partial<Record<string, string[]>> = {}; for (const r of who) { const w = steps[r].get(s.id); if (w) byRole[r] = w; }
    const guides: Partial<Record<string, GuideStep[]>> = {}; for (const r of who) { const w = walks[r].get(s.id); if (w) guides[r] = w; }
    const tab = typeof s.meta.tab === 'string' ? s.meta.tab : ''; const route = typeof s.meta.route === 'string' ? s.meta.route : '';
    const target: ScreenTarget | undefined = kind === 'tab' && tab ? { tab } : kind === 'page' && route && !NOT_LINKABLE_ROUTES.includes(route) ? { route } : undefined;
    out.push({ id: s.id, name: label, kind: KIND_WORD[kind], summary: typeof s.meta.summary === 'string' ? s.meta.summary : '', keywords: strings(s.meta.keywords), roles: who, steps: byRole, walk: guides, ...(kind === 'view' && arriveSpots(s.id).length ? { arrive: arriveSpots(s.id) } : {}), ...(target ? { target } : {}) });
  }
  return out;
}

let cached: ScreenEntry[] | undefined;
/** The list for the app, built the first time it is asked for. */
export function builtinScreens(): ScreenEntry[] { return (cached ??= buildScreenIndex()); }
