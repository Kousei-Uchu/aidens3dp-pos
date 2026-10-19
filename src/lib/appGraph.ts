// Location: src/lib/appGraph.ts
// The guidance engine. It holds the app graph (src/app.navgraph) as a live routegraph tree and answers one question:
// you are at this node, the fix is that control, what is the next thing to do to get there?
//
// It never decides what is wrong (diagnose does that) and never changes wording (the deviation's words are kept). It
// only adds the walk to a fix whose own screen is not where the person is, which is the part the old per-mistake
// logic could not do. When the person is already where the fix lives, the answer is exactly what it was.
//
// Everything is pure and guarded: a broken graph never breaks training, it just leaves the old behaviour in place.
import { indexTreeFromText, resolveSchema, planRoute, registerActions, registerScreens, clearDynamic, findReachable, type NavigationTree, type Edge, type InstructionStep, type JsonObject } from 'routegraph';
import { APP_NAVGRAPH, APP_NAVSCHEMA } from './appNavgraph.generated';
import { screenOfSpot, gestureOfSpot, lineWindowScreen } from './appControls';
import { SPOT, isWindowSpot, cartLineSpot, lineMinusSpot, lineRemoveSpot, lineNoteSpot, lineDiscountSpot, lineDiscountOffSpot, linePriceSpot, linePriceOffSpot, lineAdjustSpot, lineAdjustOffSpot, lineKeyOf } from './trainingSpots';
import { fixCandidates, type Deviation, type FixCandidate } from './trainingCourse';
import { GESTURES, type Gesture } from './pointerGesture';
import type { TrainSnap } from './trainingModule';

/** The route name (as the nav stack calls it) for each pushed page node. */
const ROUTE_SCREEN: Record<string, string> = {
  pay: 'page_pay', cart: 'page_cart', saved: 'page_saved', orders: 'page_orders', items: 'page_items',
  createItem: 'page_create_item', editItem: 'page_edit_item', customers: 'page_customers', reports: 'page_reports',
  giftcards: 'page_giftcards', drawer: 'page_drawer', settings: 'page_settings', staff: 'page_staff',
  diagnostics: 'page_diagnostics', help: 'page_help', training: 'page_training', trainingRun: 'page_training_run',
  terminalPlay: 'page_terminal_play', cloudSync: 'page_cloud_sync',
};

/** The graph screen for a page the app pushes by route name, or undefined when the graph has no node for it (patch 0167). The assistant uses it to say which page a person is on. */
export const screenOfRoute = (route: string): string | undefined => (Object.prototype.hasOwnProperty.call(ROUTE_SCREEN, route) ? ROUTE_SCREEN[route] : undefined);

let built: NavigationTree | null | undefined;
const registered = new Set<string>();

/** The live tree, or null when the graph failed to load (training then keeps its old behaviour). */
export function tree(): NavigationTree | null {
  if (built !== undefined) return built;
  try {
    built = indexTreeFromText(APP_NAVGRAPH, { schema: resolveSchema(APP_NAVSCHEMA as unknown as Parameters<typeof resolveSchema>[0]), file: 'src/app.navgraph' });
  } catch { built = null; }
  return built;
}
/** Edge metadata, live (so a per line window's copied edges keep their words too). */
const edgeMeta = (id: string): JsonObject => tree()?.edge(id)?.meta ?? {};

/** Screen metadata (kind, label, roles), or undefined when there is no such screen. */
export function screenMeta(id: string): JsonObject | undefined { return tree()?.screen(id)?.meta; }
/** True when the graph has a screen with this id (used by the driver to trust a window's name). */
export function isKnownScreen(id: string | undefined): boolean { return !!id && !!tree()?.hasScreen(id); }
/** The display name of a screen, or the id itself when it is not on the graph. */
export function screenName(id: string): string { return tree()?.screen(id)?.name ?? id; }
/** True when a role may be at this screen (matches screen meta `roles`; empty or missing means anyone). */
export function roleCanReach(role: string, id: string): boolean { const roles = screenMeta(id)?.roles; return !Array.isArray(roles) || roles.length === 0 || roles.includes(role); }

/**
 * Which run a plan is for. A training module (its id, and the tabs and routes the course allows the person to use),
 * or the everyday till ("real"). Left out, nothing is filtered and every place is fair game, which is what the plain
 * tests and the old behaviour use.
 */
export type GuideScope = {
  /** The scope keys this run is in: a training module id, or "real". Missing means do not filter by tag. */
  keys?: readonly string[];
  /** When set, a place that names a tab may only be used when the tab is here (a course's `tabs`). */
  tabs?: readonly string[];
  /** When set, a place that names a route may only be used when the route is here (a course's `routes`). */
  routes?: readonly string[];
};

/** The scope of a training module's Guide or Check run. */
export const scopeForModule = (m: { id: string; tabs: readonly string[]; routes: readonly string[] }): GuideScope => ({ keys: [m.id], tabs: m.tabs, routes: m.routes });
/** The scope of the everyday till (Demo mode, Help), where nothing may guide a person through a practice-only place. */
export const scopeForReal = (): GuideScope => ({ keys: ['real'] });

/**
 * True when a place's metadata is inside the run's scope. A place with no `modules` tag is in every scope, so only the
 * places that differ carry it (the practice camera, the practice pass, the real camera). A place that names a tab or a
 * route the course does not allow is out of scope even without a tag, because the course already says it does not exist
 * there: that is what keeps a module from guiding a person to a page it never lets them open.
 */
export function metaInScope(meta: JsonObject, scope?: GuideScope): boolean {
  if (!scope) return true;
  const tags = meta.modules;
  if (scope.keys && Array.isArray(tags) && tags.length && !tags.some(k => typeof k === 'string' && scope.keys!.includes(k))) return false;
  const tab = meta.tab; if (scope.tabs && typeof tab === 'string' && !scope.tabs.includes(tab)) return false;
  const route = meta.route; if (scope.routes && typeof route === 'string' && !scope.routes.includes(route)) return false;
  return true;
}

/** True when a screen is inside the run's scope. */
export function screenInScope(id: string, scope?: GuideScope): boolean { const m = screenMeta(id); return !!m && metaInScope(m, scope); }

/**
 * The veto routegraph applies while searching: an edge is dropped when the place it arrives at, or the edge itself, is
 * outside the run. Left out (no scope), search is unfiltered. `findReachable` and `planRoute` both accept it.
 */
function scopeFilter(t: NavigationTree, scope?: GuideScope): ((e: Edge) => boolean) | undefined {
  if (!scope) return undefined;
  return (e: Edge): boolean => { const to = t.screen(e.to); return !!to && metaInScope(to.meta, scope) && metaInScope(e.meta, scope); };
}

/** Every screen reachable from `from` (used by tests and by wording helpers), optionally within a run's scope. */
export function reachable(from: string, scope?: GuideScope): string[] { const t = tree(); if (!t || !t.screen(from)) return []; try { return findReachable(t, from, { edgeFilter: scopeFilter(t, scope) }); } catch { return []; } }

/** The graph node a person is on right now, from what training can see. A window that names itself (`snap.sheet`,
 * set from the layer stack) is the node: a fix inside it is not told to close it and one outside it is walked out
 * through it. This replaces the fold-every-sheet-into-the-page behaviour. An open line window is the same idea with a
 * per line name: the editor announces `sheet_line:<key>` (see `ensureLineWindow`); `openLine` is the fallback for when
 * it does not. Sheets that do not name themselves still fold into the page or tab under them. */
export function stateNode(snap: Pick<TrainSnap, 'tab' | 'route' | 'where' | 'locked' | 'openLine' | 'sheet'>): string {
  if (snap.locked) return 'overlay_lock';
  if (snap.sheet && tree()?.hasScreen(snap.sheet)) return snap.sheet;
  if (snap.openLine) { const w = lineWindowScreen(snap.openLine); if (tree()?.hasScreen(w)) return w; }
  if (snap.route && ROUTE_SCREEN[snap.route]) return ROUTE_SCREEN[snap.route];
  if (!snap.route && snap.where) { if (snap.where.tab === 'keypad') return 'view_keypad'; if (snap.where.tab === 'all') return 'view_all'; }
  return `tab_${snap.tab}`;
}

/** The graph node id for a control: stable, and safe as a screen id. */
export const nodeForSpot = (spot: string): string => `do_${spot.replace(/[^A-Za-z0-9_]/g, '_')}`;

/** The gesture an instruction action is performed with, preferring the edge's own declared gesture. */
function gestureFromStep(step: InstructionStep, meta: JsonObject): Gesture {
  const declared = meta.gesture;
  if (typeof declared === 'string' && (GESTURES as readonly string[]).includes(declared)) return declared as Gesture;
  for (const a of step.actions) {
    if (a.type === 'LONG_PRESS') return 'hold';
    if (a.type === 'SWIPE') { const d = (a.data as JsonObject).direction; return d === 'right' ? 'swipe-right' : d === 'up' ? 'swipe-up' : d === 'down' ? 'swipe-down' : 'swipe-left'; }
  }
  return 'tap';
}

/** The spot a step points at, from the edge metadata or the action payload. */
function spotOfStep(step: InstructionStep, meta: JsonObject): string | undefined {
  if (typeof meta.spot === 'string') return meta.spot;
  for (const a of step.actions) { const t = (a.data as JsonObject).target; if (typeof t === 'string') return t; }
  return undefined;
}

/** The control a planned step taps (patch 0162), or undefined when the step has none. The assistant's guide reads this to know what to point at. */
export const spotOfPlanStep = (step: InstructionStep): string | undefined => spotOfStep(step, edgeMeta(step.edge));

/** How many times a step's action is performed in a row, when the graph asks for more than one (shown as "xN"). */
function repeatOfStep(step: InstructionStep): number | undefined {
  for (const a of step.actions) if (typeof a.repeat === 'number' && a.repeat > 1) return a.repeat;
  return undefined;
}

/** Turn one graph step into the candidate the dock and overlay already know how to draw. */
function candidateFromStep(step: InstructionStep, fixSay: string): FixCandidate | null {
  const meta = edgeMeta(step.edge);
  const spot = spotOfStep(step, meta);
  if (!spot) return null;
  const prefix = typeof meta.say === 'string' ? meta.say : '';
  const say = [prefix, fixSay].filter(Boolean).join(' ').trim();
  return { target: spot, say, gesture: gestureFromStep(step, meta), repeat: repeatOfStep(step) };
}

/**
 * The navigation a stray needs from where the person is to the screen the fix lives on, deepest first. Empty when
 * they are already there, when the fix is a universal control, when the fix lives outside this run's scope, or when the
 * walk cannot be planned.
 */
export function routeNavSteps(d: Pick<Deviation, 'say' | 'target' | 'via' | 'gesture' | 'window' | 'chain'>, snap: Pick<TrainSnap, 'tab' | 'route' | 'where' | 'locked' | 'sheets' | 'openLine' | 'sheet'>, windowOpen = snap.sheets > 0, scope?: GuideScope): FixCandidate[] {
  const t = tree(); if (!t) return [];
  const base = fixCandidates(d, windowOpen);
  const primary = base.find(c => c.target);
  const dest = primary?.target ? screenOfSpot(primary.target) : undefined;
  const from = stateNode(snap);
  const out: FixCandidate[] = [];
  // A window is in the way of a fix that is not itself inside a window: close it first, exactly as the old wording does.
  // When the window names itself (`snap.sheet`) and the fix lives on that same window, it is not in the way.
  const fixScreen = primary?.target ? screenOfSpot(primary.target) : undefined;
  const inOpenWindow = !!snap.sheet && fixScreen === snap.sheet;
  const forcedByWindow = windowOpen && !inOpenWindow && !!primary?.target && primary.target !== SPOT.sheetClose && primary.target !== SPOT.back && !isWindowSpot(primary.target);
  if (forcedByWindow) out.push({ target: SPOT.sheetClose, say: `Close this window first. ${d.say}`, gesture: 'tap' });
  if (dest && dest !== from && t.screen(from) && t.screen(dest) && (!scope || screenInScope(dest, scope))) {
    const plan = planRoute(t, from, [{ screen: dest }], { edgeFilter: scopeFilter(t, scope) });
    if (plan.ok) for (const step of plan.instructions.steps) { const c = candidateFromStep(step, d.say); if (c) out.push(c); }
  }
  return out;
}

/**
 * The ordered places to point at for a stray. The fix itself comes first, in exactly the words and order the app has
 * always used (`fixCandidates`), so nothing about how a normal stray reads or looks changes. Behind it come the graph's
 * extra waypoints: a fix hidden under a window, and the walk back from wherever the person actually is. The driver
 * points at the first one really on screen, so the graph only shows through when the plain answer is not reachable.
 * The optional scope keeps the walk inside the run (a course's tabs and routes, and the practice or real places).
 */
export function guidanceCandidates(d: Pick<Deviation, 'say' | 'target' | 'via' | 'gesture' | 'window' | 'chain'>, snap: Pick<TrainSnap, 'tab' | 'route' | 'where' | 'locked' | 'sheets' | 'openLine' | 'sheet'>, windowOpen = snap.sheets > 0, scope?: GuideScope): FixCandidate[] {
  const base = fixCandidates(d, windowOpen);
  let nav: FixCandidate[] = [];
  try { nav = routeNavSteps(d, snap, windowOpen, scope); } catch { nav = []; }
  if (!nav.length) return base;
  const seen = new Set(base.map(c => c.target).filter((t): t is string => !!t));
  return [...base, ...nav.filter(c => c.target && !seen.has(c.target))];
}

/**
 * A runtime control to put on the graph. A bare spot id, or an object when the instance itself belongs to a run: the
 * grid tile of a product a course has, a customer row, a practice user. `modules` is the same list a screen carries (a
 * module id, or "real"); left out the instance is in every run, which is right for the shared practice data and the
 * everyday till. This is the per-instance half of a scope: screens and edges are tagged in `src/app.navgraph`, while
 * the records a run builds (products, tiles, rows, users) are tagged here, so a run never names an instance it does not
 * have even when two runs share the same screen.
 *
 * `repeat` is how many times the control is used in a row (the minus button, to take more than one out). It rides on
 * the action node and comes back on the candidate the dock draws, as "xN". Left out: once.
 */
export type RuntimeSpot = string | { spot: string; modules?: readonly string[]; repeat?: number };

/**
 * Put one line's window on the graph, a copy of the shared `sheet_line` template named `sheet_line:<key>` (the copy's
 * opening edge fills $ITEM_KEY$ with the key, so a walk points at that exact cart line). Called before a line control
 * is registered on it. Safe to call when it is already there.
 */
function ensureLineWindow(t: NavigationTree, key: string): void {
  if (t.hasScreen(lineWindowScreen(key))) return;
  try { registerScreens(t, [{ id: key, params: { ITEM_KEY: key } }], 'sheet_line', { onDuplicate: 'skip' }); }
  catch { /* a window that cannot be added never blocks guidance */ }
}

/**
 * Put the controls of runtime data on the graph (grid tiles, cart lines, customer rows, refund picks, and the rest),
 * so guidance can name them and their gesture. Call it when a list is (re)built. Safe to call with ids already added
 * (the first registration of a node wins, so tag it when it first goes on).
 */
export function registerRuntimeSpots(spots: readonly RuntimeSpot[]): void {
  const t = tree(); if (!t) return;
  for (const entry of spots) {
    const spot = typeof entry === 'string' ? entry : entry.spot;
    const modules = typeof entry === 'string' ? undefined : entry.modules;
    const repeat = typeof entry === 'string' ? undefined : entry.repeat;
    const node = nodeForSpot(spot); if (registered.has(node)) continue;
    const screen = screenOfSpot(spot); if (!screen) continue;
    if (screen.startsWith('sheet_line:')) ensureLineWindow(t, screen.slice('sheet_line:'.length));
    if (!t.hasScreen(screen)) continue;
    const gesture = gestureOfSpot(spot);
    const action = gesture === 'swipe-left'
      ? { type: 'SWIPE', data: { direction: 'left', target: spot } as JsonObject, ...(repeat && repeat > 1 ? { repeat } : {}) }
      : { type: 'TAP', data: { target: spot } as JsonObject, ...(repeat && repeat > 1 ? { repeat } : {}) };
    const meta = modules && modules.length ? { modules: [...modules] } : undefined;
    try { registerActions(t, screen, { [node]: meta ? { name: spot, actions: [action], meta } : { name: spot, actions: [action] } }, { onDuplicate: 'skip' }); registered.add(node); }
    catch { /* a control that cannot be added never blocks guidance */ }
  }
}
/** Register the controls of the sale as it stands now (each cart line, and the sub controls inside its window). */
export function syncRuntimeFromSnap(snap: Pick<TrainSnap, 'cart'>): void {
  const spots: string[] = [];
  for (const l of snap.cart) {
    if (l.variantId) spots.push(cartLineSpot(l.variantId));
    const key = lineKeyOf(l);
    if (key) spots.push(lineMinusSpot(key), lineRemoveSpot(key), lineNoteSpot(key), lineDiscountSpot(key), lineDiscountOffSpot(key), linePriceSpot(key), linePriceOffSpot(key), lineAdjustSpot(key), lineAdjustOffSpot(key));
  }
  registerRuntimeSpots(spots);
}

/** Forget every runtime control (call when the practice data is swapped out). */
export function clearRuntimeSpots(): void { const t = tree(); if (t) { try { clearDynamic(t); } catch { /* nothing */ } } registered.clear(); }

/**
 * The walk to one control from `from`, at control level, ending on the control itself. Registers the control first if
 * it came from runtime data. Used to draw a gesture (a swipe a decision needs) and by tests. The optional scope keeps
 * the walk inside a run, and refuses a control whose own place is outside it.
 */
export function planToSpot(spot: string, from: string, scope?: GuideScope): FixCandidate[] {
  const t = tree(); if (!t || !t.hasScreen(from)) return [];
  registerRuntimeSpots([spot]); // may put a line's window on the graph, so its scope can be read below
  const dest = screenOfSpot(spot);
  if (scope && dest && !screenInScope(dest, scope)) return [];
  const node = nodeForSpot(spot);
  if (!t.hasScreen(node)) return [];
  const plan = planRoute(t, from, [{ action: node }], { edgeFilter: scopeFilter(t, scope) });
  if (!plan.ok) return [];
  const out: FixCandidate[] = [];
  for (const step of plan.instructions.steps) { const c = candidateFromStep(step, ''); if (c) out.push(c); }
  return out;
}

/** True when a control is on the graph (after registration), for tests and diagnostics. */
export function hasSpotNode(spot: string): boolean { const t = tree(); if (!t) return false; try { return !!t.screen(nodeForSpot(spot)); } catch { return false; } }

/** All controls currently on the graph, for tests and diagnostics. */
export function runtimeNodes(): string[] { return [...registered]; }
