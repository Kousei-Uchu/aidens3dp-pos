// Location: src/lib/trainingModule.ts
// The shape of a training module (B6) and the checker that refuses a badly written one. Pure, tested.
// Writer's guide: src/training/README.md
import { validateDemo } from './trainingDemo';
import { isGesture, type Gesture } from './pointerGesture';
import { isWindowSpot } from './trainingSpots';
import { RESPONSE_CODES } from './responseCodes';
export type { Gesture } from './pointerGesture';
export type Stage = 'info' | 'show' | 'guide' | 'check1' | 'check2' | 'gratify';
export const STAGES: readonly Stage[] = ['info', 'show', 'guide', 'check1', 'check2', 'gratify'];
export const STAGE_LABEL: Record<Stage, string> = { info: 'Info', show: 'Show', guide: 'Guide', check1: 'Check 1', check2: 'Check 2', gratify: 'Done' };
export const SANDBOX_STAGES: readonly Stage[] = ['guide', 'check1', 'check2'];
export const needsSandbox = (s: Stage): boolean => SANDBOX_STAGES.includes(s);

export type Tone = 'neutral' | 'good' | 'bad' | 'accent';
/**
 * The Info and Show stages (B6) share one format: an animated demonstration drawn with simplified copies of the real screens (a "mock"), in a fixed canvas.
 * A camera zooms and pans over the canvas, a pointer taps controls, and the picture changes as the steps play.
 * It is watched, not played: the person moves through it with Next and Back. Ids are unique across the whole demo.
 */
export type DemoKind = 'panel' | 'bar' | 'text' | 'button' | 'tile' | 'row' | 'toggle' | 'field' | 'chip' | 'icon' | 'terminal';
/** x, y, w, h are canvas units (the canvas is demo.canvas.w by demo.canvas.h). Nodes draw in list order, so later ones sit on top. */
export type DemoNode = {
  id: string; kind: DemoKind; x: number; y: number; w: number; h: number;
  label?: string; sub?: string; value?: string; icon?: string;
  tone?: Tone; color?: string; on?: boolean; hidden?: boolean; size?: number; align?: 'left' | 'center' | 'right';
  /** For a `terminal` node: `value` is the screen it shows (a `VtScreen`: sleep, amount, pin, processing, approved, declined, removeCard, cancelled, receipt, unavailable), `amount` the payment in cents, and `on` means dark mode. */
  amount?: number;
};
/** What a step changes on a node. Only these fields can change. */
export type DemoEffect = Partial<Pick<DemoNode, 'hidden' | 'label' | 'sub' | 'value' | 'icon' | 'tone' | 'color' | 'on' | 'amount'>>;
export type DemoScreen = { id: string; nodes: DemoNode[] };
/**
 * One step. In order, when it plays: the camera goes to `tap` (or `focus`), the pointer moves to `tap` and taps it,
 * then `screen` and `set` happen, then the camera settles on `focus` and the spotlight rings it. With neither `tap` nor `focus` the camera shows the whole screen.
 */
export type DemoStep = {
  id?: string; say: string; title?: string;
  screen?: string; focus?: string; tap?: string; zoom?: number;
  gesture?: Gesture;                              // how the cursor reaches `tap`: a tap (the default), double or triple tap, press and hold, a swipe or a scroll
  note?: string;                                  // a short label with an arrow, drawn next to the focus
  set?: Record<string, DemoEffect>;
};
export type Demo = { canvas: { w: number; h: number }; screens: DemoScreen[]; steps: DemoStep[] };

/** One cart line as training sees it. */
export type SnapLine = { variantId?: string; title: string; kind: 'item' | 'custom' | 'gift_card'; qty: number; discounted: boolean; adjusted: boolean; /** The line's own id, for telling two custom amounts apart. */ lineId?: string; /** The line has an item price of its own / a whole-line adjustment (`adjusted` is either). */ itemPriced?: boolean; lineAdjusted?: boolean; /** What one costs, in cents, when the line has a price of its own (a custom amount). */ unitCents?: number };
/** What the training driver can see of the app. Kept small on purpose. `sheets` is how many sheets are open on top of the page. */
export type TrainSnap = {
  tab: string; route: string; sheets: number; lines: number; qty: number; sales: number; hasCustomer: boolean; tenders: number; paying: boolean;
  cart: SnapLine[]; cartDiscount: boolean; orderAdjusted: boolean; hasNote: boolean;
  /** Who is signed in (a practice staff id such as `train-staff-casey`) and whether the Sign in screen is up. Left out by plain tests. */
  staffId?: string; locked?: boolean;
  /** What is typed in Search and on the Keypad, and where Checkout is (tab, how many levels deep, whether sizes are open). Left out by plain tests. */
  /** The Cash, Gift card or Split choice that is open on the Payment page, when one is. */ payOpen?: 'cash' | 'gift' | 'split';
  /** How the last finished sale was paid (one entry per tender). */ lastSaleKinds?: string[];
  /** Which line's window is open (its variant, or its own id), when one is. */ openLine?: string;
  typed?: { search?: string; keypad?: string }; where?: { tab: 'keypad' | 'quick' | 'all'; depth: number; sizes: boolean };
};
export type Until =
  | { kind: 'next' }                                  // an informational step: the Next button moves on
  | { kind: 'press'; id: string }                     // the person taps this spot
  | { kind: 'visible'; id: string }                   // this spot is on screen (for example a sheet opened)
  | { kind: 'state'; test: (s: TrainSnap) => boolean };
/**
 * One Guide step. `allow`, `at` and `watch` work exactly as they do on a Check goal (see `Goal`): what may change during the step without being off course,
 * where it happens, and mistakes specific to this step. Left out, `allow` is worked out from the step (tapping a grid tile allows adding, a cart line allows removing),
 * and the step happens anywhere the course allows. A step that waits on the till changing (`until: state`) must say `allow` itself.
 */
export type Step = { id: string; say: string; title?: string; target?: string; until: Until; recover?: { say: string; target?: string }; allow?: Allow[]; at?: Place; watch?: Watch[];
  /** How the person reaches the target, shown by the cursor and enforced inside the ringed box: a swipe step never lets a tap open what is underneath. Left out it is a tap. */
  gesture?: Gesture;
  /** Looked at on every check, before `target`. Returns what to say and point at right now (the next key to tap, the way back to the grid), or null to use `say` and `target` as written. */
  aim?: (s: TrainSnap) => { say: string; target: string } | null };

/** Things that go wrong on purpose in Check 2. Customer side only, never admin problems. */
export type Injection =
  | { kind: 'cart'; items: { variantId: string; qty: number }[] }       // start the run with these lines in the cart
  | { kind: 'decline'; times: number; code?: string }                   // the practice terminal declines the card this many times (code 51, insufficient funds, unless a code from responseCodes.ts is given)
  | { kind: 'ledger'; counts: Record<string, number> }
  | { kind: 'staff'; who: 'casey' | 'morgan' | 'locked' }              // start signed in as a practice person, or on the Sign in screen (practiceStaff courses only)
  | { kind: 'pass'; state: 'cancelled' };                               // the practice cashier pass has been cancelled, so the till will not recognise it                 // replace the drawer contents (for example no small change)
/** What a person may change during a goal without it counting as going off course. Anything else they change is spotted and undone with them. */
export type Allow = 'add' | 'remove' | 'qty' | 'discount' | 'adjust' | 'customer' | 'note' | 'tender' | 'sale';
export const ALLOWS: readonly Allow[] = ['add', 'remove', 'qty', 'discount', 'adjust', 'customer', 'note', 'tender', 'sale'];
/** Where the work for a goal happens. Anywhere else is off course. Left out, it is the module's own tabs and routes, with sheets allowed. */
export type Place = { tabs?: string[]; routes?: string[]; sheets?: boolean;
  /** Where on Checkout this part happens: `top` is the Quick Menu grid at its first level, `grid` is anywhere on Quick Menu. Left out: no rule. */ view?: 'top' | 'grid' };
/** A mistake specific to one goal, in the module author's words: when it is true, the person is told `say` and pointed at `target`. */
/** `how` is the plain steps to put it right, and `taughtIn` the module that teaches them (left out, the module the person is in). */
export type Watch = { id: string; when: (s: TrainSnap) => boolean; say: string; target?: string; via?: string; how?: string[]; taughtIn?: string;
  /** `restart` for a mistake a tap cannot undo (a finished sale). Left out: `undo`. */ fix?: 'undo' | 'restart' };
export type Goal = {
  id: string; title: string;                  // what the person has to achieve, shown in the dock
  until: Until;                               // how the app knows they did it (never 'next')
  ladder: string[];                           // hints from vague to specific; the answer is revealed after the last one
  reveal?: string;                            // spot to highlight when the hints are used up
  gesture?: Gesture;                          // how the answer is reached, shown by the cursor when it is revealed (left out: a tap)
  via?: string;                               // spot to point at first when `reveal` is not on screen (for example the bar that opens the cart on a phone)
  inject?: Injection[];
  taughtBy?: string;                          // Check 2 only: the id of the info step, show step or guide step that taught the fix
  allow: Allow[];                             // what may change without being off course (an empty list means nothing may change except what the goal asks)
  at?: Place;                                 // where the work happens
  watch?: Watch[];                            // mistakes specific to this goal
};
export type TrainingModule = {
  id: string; title: string; summary: string; minutes: number; suggestedFirst?: boolean;
  flow: 'standard' | 'guided';                // which checkout the sandbox forces
  /** Who plays the customer at the virtual card terminal. `auto` (the default): the terminal taps a card and keys the PIN by itself. `manual`: the person does it on the terminal's screen. */
  card?: 'auto' | 'manual';
  /** Practice runs with two practice staff (Casey, a cashier, and Morgan, a manager) who have known PINs and a cashier pass, and requires sign-in. Left out, the real staff list is kept. */
  practiceStaff?: boolean;
  tabs: string[]; routes: string[];           // where the person may go during Guide and Check
  info: Demo; show: Demo; guide: Step[];
  check1: Goal[]; check2: Goal[];
  recap: string[];                            // short adult lines on the Done screen: what they can now do
};

/** Every problem with a module, as plain sentences. Empty list = fine. `spotOk` says whether a spot id exists in the UI. */
export function validateModule(m: TrainingModule, spotOk: (id: string) => boolean, spotIcon: (name: string) => boolean = () => true): string[] {
  const bad: string[] = []; const at = (w: string, t: string) => bad.push(`${m.id}: ${w}: ${t}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id)) bad.push(`${m.id}: id must be lower case letters, digits and hyphens`);
  if (!m.title.trim() || !m.summary.trim()) at('header', 'needs a title and a summary');
  for (const e of validateDemo(m.info, spotIcon)) at('info', e);
  for (const e of validateDemo(m.show, spotIcon)) at('show', e);
  if (!m.guide.length) at('guide', 'needs steps');
  const stepIds = new Set(m.guide.map(s => s.id)); if (stepIds.size !== m.guide.length) at('guide', 'step ids repeat');
  for (const s of m.guide) {
    if (!s.say.trim()) at('guide', `step ${s.id} says nothing`);
    if (s.until.kind === 'press' && !s.target) at('guide', `step ${s.id} waits for a tap but points at nothing`);
    for (const t of [s.target, s.recover?.target, s.until.kind === 'press' || s.until.kind === 'visible' ? s.until.id : undefined]) if (t && !spotOk(t)) at('guide', `step ${s.id} uses the unknown spot "${t}"`);
    if (s.until.kind === 'state' && !s.allow) at('guide', `step ${s.id} waits on the till changing, so it must say what may change (allow)`);
    if (s.gesture !== undefined && !isGesture(s.gesture)) at('guide', `step ${s.id} has the unknown gesture "${String(s.gesture)}"`);
    if (s.until.kind === 'state' && s.target && !s.gesture) at('guide', `step ${s.id} points at something and waits on the till changing, so it must say how to reach it (gesture), for example swipe-left`);
    for (const t of [s.target, s.recover?.target]) if (t && isWindowSpot(t) && s.at?.sheets !== true) at('guide', `step ${s.id} points at "${t}", which is inside a window, so it must say windows are allowed (at: { sheets: true })`);
    for (const a of s.allow ?? []) if (!ALLOWS.includes(a)) at('guide', `step ${s.id} allows the unknown change "${a}"`);
    for (const t of s.at?.tabs ?? []) if (!m.tabs.includes(t)) at('guide', `step ${s.id} works on the tab "${t}", which the course does not allow`);
    for (const r of s.at?.routes ?? []) if (!m.routes.includes(r)) at('guide', `step ${s.id} works on the page "${r}", which the course does not allow`);
    const swi = new Set<string>();
    for (const w of s.watch ?? []) {
      if (swi.has(w.id)) at('guide', `step ${s.id} has two watches called "${w.id}"`); swi.add(w.id);
      if (!w.say.trim()) at('guide', `step ${s.id} watch ${w.id} says nothing`);
      if (w.how?.some(h => !h.trim())) at('guide', `step ${s.id} watch ${w.id} has an empty step in how`);
      for (const t of [w.target, w.via]) if (t && !spotOk(t)) at('guide', `step ${s.id} watch ${w.id} uses the unknown spot "${t}"`);
    }
  }
  const taught = new Set<string>([...stepIds, ...m.info.steps.map(b => b.id ?? ''), ...m.show.steps.map(b => b.id ?? '')].filter(Boolean));
  for (const [name, goals] of [['check1', m.check1], ['check2', m.check2]] as const) {
    if (!goals.length) at(name, 'needs at least one goal');
    const gi = new Set(goals.map(g => g.id)); if (gi.size !== goals.length) at(name, 'goal ids repeat');
    for (const g of goals) {
      if (g.until.kind === 'next') at(name, `goal ${g.id} cannot use a Next button`);
      if (g.ladder.length < 2) at(name, `goal ${g.id} needs at least 2 hints before the answer is shown`);
      if (g.ladder.some(h => !h.trim())) at(name, `goal ${g.id} has an empty hint`);
      if (!g.reveal) at(name, `goal ${g.id} has nothing to highlight when the hints run out`);
      if (g.gesture !== undefined && !isGesture(g.gesture)) at(name, `goal ${g.id} has the unknown gesture "${String(g.gesture)}"`);
      for (const t of [g.reveal, g.via, g.until.kind === 'press' || g.until.kind === 'visible' ? g.until.id : undefined]) if (t && !spotOk(t)) at(name, `goal ${g.id} uses the unknown spot "${t}"`);
      if (!Array.isArray(g.allow)) at(name, `goal ${g.id} must say what may change (allow), even if that is an empty list`);
      else for (const a of g.allow) if (!ALLOWS.includes(a)) at(name, `goal ${g.id} allows the unknown change "${a}"`);
      for (const t of g.at?.tabs ?? []) if (!m.tabs.includes(t)) at(name, `goal ${g.id} works on the tab "${t}", which the course does not allow`);
      for (const r of g.at?.routes ?? []) if (!m.routes.includes(r)) at(name, `goal ${g.id} works on the page "${r}", which the course does not allow`);
      const wi = new Set<string>();
      for (const w of g.watch ?? []) {
        if (wi.has(w.id)) at(name, `goal ${g.id} has two watches called "${w.id}"`); wi.add(w.id);
        if (!w.say.trim()) at(name, `goal ${g.id} watch ${w.id} says nothing`);
        if (w.how?.some(h => !h.trim())) at(name, `goal ${g.id} watch ${w.id} has an empty step in how`);
        for (const t of [w.target, w.via]) if (t && !spotOk(t)) at(name, `goal ${g.id} watch ${w.id} uses the unknown spot "${t}"`);
      }
    }
  }
  if (!m.check2.some(g => g.inject?.length)) at('check2', 'must make something go wrong (needs at least one goal with an injection)');
  for (const g of m.check2) { if (g.inject?.length && !g.taughtBy) at('check2', `goal ${g.id} injects a problem but does not say where it was taught`); if (g.taughtBy && !taught.has(g.taughtBy)) at('check2', `goal ${g.id} says it was taught by "${g.taughtBy}", which does not exist`); }
  if (!m.recap.length) at('recap', 'needs at least one line');
  if (!m.tabs.includes('checkout')) at('header', 'tabs must include checkout');
  if (m.card !== undefined && m.card !== 'auto' && m.card !== 'manual') at('header', `card must be "auto" or "manual", not "${String(m.card)}"`);
  for (const [name, goals] of [['check1', m.check1], ['check2', m.check2]] as const) for (const g of goals) for (const i of g.inject ?? []) if ((i.kind === 'staff' || i.kind === 'pass') && !m.practiceStaff) at(name, `goal ${g.id} uses a ${i.kind} injection, which needs practiceStaff on the course`);
  for (const g of [...m.check1, ...m.check2]) for (const i of g.inject ?? []) if (i.kind === 'decline') {
    if (!(Number.isInteger(i.times) && i.times >= 1 && i.times <= 5)) at('check2', `goal ${g.id} declines the card ${String(i.times)} times, which must be a whole number from 1 to 5`);
    if (i.code !== undefined && !RESPONSE_CODES[i.code]) at('check2', `goal ${g.id} declines with the unknown response code "${i.code}"`);
  }
  return bad;
}
