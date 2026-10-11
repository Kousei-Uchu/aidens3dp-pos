// Location: src/lib/trainingModule.ts
// The shape of a training module (B6) and the checker that refuses a badly written one. Pure, tested.
// Writer's guide: src/training/README.md
export type Stage = 'info' | 'show' | 'guide' | 'check1' | 'check2' | 'gratify';
export const STAGES: readonly Stage[] = ['info', 'show', 'guide', 'check1', 'check2', 'gratify'];
export const STAGE_LABEL: Record<Stage, string> = { info: 'Info', show: 'Show', guide: 'Guide', check1: 'Check 1', check2: 'Check 2', gratify: 'Done' };
export const SANDBOX_STAGES: readonly Stage[] = ['guide', 'check1', 'check2'];
export const needsSandbox = (s: Stage): boolean => SANDBOX_STAGES.includes(s);

export type Tone = 'neutral' | 'good' | 'bad' | 'accent';
/** A thing in a scene. x and y are percentages of the scene box (0 to 100). */
export type Actor = { id: string; icon: string; label?: string; x: number; y: number; hidden?: boolean; tone?: Tone };
/** One sentence plus what happens on screen while it is said. */
export type Beat = { id?: string; say: string; place?: Record<string, { x?: number; y?: number }>; show?: string[]; hide?: string[]; pulse?: string[]; tone?: Record<string, Tone> };
export type Scene = { actors: Actor[]; beats: Beat[] };

/** What the training driver can see of the app. Kept small on purpose. */
export type TrainSnap = { tab: string; route: string; lines: number; qty: number; sales: number; hasCustomer: boolean; tenders: number; paying: boolean };
export type Until =
  | { kind: 'next' }                                  // an informational step: the Next button moves on
  | { kind: 'press'; id: string }                     // the person taps this spot
  | { kind: 'visible'; id: string }                   // this spot is on screen (for example a sheet opened)
  | { kind: 'state'; test: (s: TrainSnap) => boolean };
export type Step = { id: string; say: string; title?: string; target?: string; until: Until; recover?: { say: string; target?: string } };

/** Things that go wrong on purpose in Check 2. Customer side only, never admin problems. */
export type Injection =
  | { kind: 'cart'; items: { variantId: string; qty: number }[] }       // start the run with these lines in the cart
  | { kind: 'decline'; times: number }                                  // the fake terminal declines the card this many times (code 51)
  | { kind: 'ledger'; counts: Record<string, number> };                 // replace the drawer contents (for example no small change)
export type Goal = {
  id: string; title: string;                  // what the person has to achieve, shown in the dock
  until: Until;                               // how the app knows they did it (never 'next')
  ladder: string[];                           // hints from vague to specific; the answer is revealed after the last one
  reveal?: string;                            // spot to highlight when the hints are used up
  via?: string;                               // spot to point at first when `reveal` is not on screen (for example the bar that opens the cart on a phone)
  inject?: Injection[];
  taughtBy?: string;                          // Check 2 only: the id of the info beat, show beat or guide step that taught the fix
};
export type TrainingModule = {
  id: string; title: string; summary: string; minutes: number; suggestedFirst?: boolean;
  flow: 'standard' | 'guided';                // which checkout the sandbox forces
  tabs: string[]; routes: string[];           // where the person may go during Guide and Check
  info: Scene; show: Scene; guide: Step[];
  check1: Goal[]; check2: Goal[];
  recap: string[];                            // short adult lines on the Done screen: what they can now do
};

/** Every problem with a module, as plain sentences. Empty list = fine. `spotOk` says whether a spot id exists in the UI. */
export function validateModule(m: TrainingModule, spotOk: (id: string) => boolean): string[] {
  const bad: string[] = []; const at = (w: string, t: string) => bad.push(`${m.id}: ${w}: ${t}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id)) bad.push(`${m.id}: id must be lower case letters, digits and hyphens`);
  if (!m.title.trim() || !m.summary.trim()) at('header', 'needs a title and a summary');
  for (const [name, sc] of [['info', m.info], ['show', m.show]] as const) {
    if (sc.beats.length < 3) at(name, 'needs at least 3 beats');
    const ids = new Set(sc.actors.map(a => a.id)); if (ids.size !== sc.actors.length) at(name, 'actor ids repeat');
    sc.beats.forEach((b, i) => {
      if (!b.say.trim()) at(name, `beat ${i + 1} says nothing`);
      for (const k of [...Object.keys(b.place ?? {}), ...(b.show ?? []), ...(b.hide ?? []), ...(b.pulse ?? []), ...Object.keys(b.tone ?? {})]) if (!ids.has(k)) at(name, `beat ${i + 1} mentions the unknown actor "${k}"`);
    });
  }
  if (!m.guide.length) at('guide', 'needs steps');
  const stepIds = new Set(m.guide.map(s => s.id)); if (stepIds.size !== m.guide.length) at('guide', 'step ids repeat');
  for (const s of m.guide) {
    if (!s.say.trim()) at('guide', `step ${s.id} says nothing`);
    if (s.until.kind === 'press' && !s.target) at('guide', `step ${s.id} waits for a tap but points at nothing`);
    for (const t of [s.target, s.recover?.target, s.until.kind === 'press' || s.until.kind === 'visible' ? s.until.id : undefined]) if (t && !spotOk(t)) at('guide', `step ${s.id} uses the unknown spot "${t}"`);
  }
  const taught = new Set<string>([...stepIds, ...m.info.beats.map(b => b.id ?? ''), ...m.show.beats.map(b => b.id ?? '')].filter(Boolean));
  for (const [name, goals] of [['check1', m.check1], ['check2', m.check2]] as const) {
    if (!goals.length) at(name, 'needs at least one goal');
    const gi = new Set(goals.map(g => g.id)); if (gi.size !== goals.length) at(name, 'goal ids repeat');
    for (const g of goals) {
      if (g.until.kind === 'next') at(name, `goal ${g.id} cannot use a Next button`);
      if (g.ladder.length < 2) at(name, `goal ${g.id} needs at least 2 hints before the answer is shown`);
      if (g.ladder.some(h => !h.trim())) at(name, `goal ${g.id} has an empty hint`);
      if (!g.reveal) at(name, `goal ${g.id} has nothing to highlight when the hints run out`);
      for (const t of [g.reveal, g.via, g.until.kind === 'press' || g.until.kind === 'visible' ? g.until.id : undefined]) if (t && !spotOk(t)) at(name, `goal ${g.id} uses the unknown spot "${t}"`);
    }
  }
  if (!m.check2.some(g => g.inject?.length)) at('check2', 'must make something go wrong (needs at least one goal with an injection)');
  for (const g of m.check2) { if (g.inject?.length && !g.taughtBy) at('check2', `goal ${g.id} injects a problem but does not say where it was taught`); if (g.taughtBy && !taught.has(g.taughtBy)) at('check2', `goal ${g.id} says it was taught by "${g.taughtBy}", which does not exist`); }
  if (!m.recap.length) at('recap', 'needs at least one line');
  if (!m.tabs.includes('checkout')) at('header', 'tabs must include checkout');
  return bad;
}
