// Location: src/lib/assistantScreens.ts
// The screens the assistant may tell people about (patch 0158). It reads the app graph (src/app.navgraph) once and turns it into
// a plain list: what each screen is called, what it is for, which roles can get to it, and how to open it from the Checkout tab.
// The assistant's tools get this list and never touch the graph themselves, so they stay pure and cannot change anything.
//
// Roles are worked out by walking the graph once per role, dropping every transition and screen that role may not use. A
// screen only lists a role when that role can really get there. That is stricter than the `roles` on the screen alone: the
// Settings page has no `roles` of its own, but the transition into it does, so a cashier never reaches it.
import { findReachable, planRoute, type Edge, type JsonObject } from 'routegraph';
import { metaInScope, scopeForReal, tree } from './appGraph';
import { PAGE_ROLES } from './helpDocs';

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
};

/** Where every walk starts. Checkout is the screen the till opens on. */
export const HOME_SCREEN = 'tab_checkout';
export const HOME_NAME = 'Checkout';

/** Stand-in values for the graph's variables. A walk to a cart line's window needs a line key to be planned; the words said do not depend on which key. */
const PLAN_VARIABLES = { ITEM_KEY: 'item' };

/** The word for a screen kind that a cashier would use. Sheets are shown as windows, which is what the app calls them. */
const KIND_WORD: Record<string, string> = { tab: 'tab', view: 'view', page: 'page', sheet: 'window', overlay: 'overlay' };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const roleOk = (meta: JsonObject, role: string): boolean => { const r = strings(meta.roles); return r.length === 0 || r.includes(role); };

/**
 * Builds the list. Overlays (sign in, the screensaver, the cameras) are left out because nobody goes looking for them, and so
 * is every screen that only exists in a practice lesson. Screens made while the till runs (one window per cart line) are not
 * on the graph yet, so they are not here either.
 */
export function buildScreenIndex(roles: readonly string[] = PAGE_ROLES): ScreenEntry[] {
  const t = tree(); if (!t || !t.hasScreen(HOME_SCREEN)) return [];
  const scope = scopeForReal();
  const reach: Record<string, Set<string>> = {}; const steps: Record<string, Map<string, string[]>> = {};
  for (const role of roles) {
    const edgeFilter = (e: Edge): boolean => {
      const to = t.screen(e.to);
      return !!to && metaInScope(to.meta, scope) && metaInScope(e.meta, scope) && roleOk(to.meta, role) && roleOk(e.meta, role);
    };
    let ids: string[] = []; try { ids = findReachable(t, HOME_SCREEN, { edgeFilter }); } catch { ids = []; }
    reach[role] = new Set(ids); steps[role] = new Map();
    for (const id of ids) {
      if (id === HOME_SCREEN) { steps[role].set(id, []); continue; }
      try {
        const plan = planRoute(t, HOME_SCREEN, [{ screen: id }], { edgeFilter, variables: PLAN_VARIABLES });
        if (!plan.ok) continue;
        const said = plan.instructions.steps.map(s => t.edge(s.edge)?.meta.say).filter((x): x is string => typeof x === 'string' && x.length > 0);
        if (said.length) steps[role].set(id, said);
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
    out.push({ id: s.id, name: label, kind: KIND_WORD[kind], summary: typeof s.meta.summary === 'string' ? s.meta.summary : '', keywords: strings(s.meta.keywords), roles: who, steps: byRole });
  }
  return out;
}

let cached: ScreenEntry[] | undefined;
/** The list for the app, built the first time it is asked for. */
export function builtinScreens(): ScreenEntry[] { return (cached ??= buildScreenIndex()); }
