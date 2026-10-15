// Location: src/state/trainingSession.ts
// The training session: which course run is open, the practice-data swap, hints, and what the overlay should draw.
// The swap keeps the real state in memory only. Nothing real is changed on disk, so a crash mid-training just reopens the normal till.
import { create } from 'zustand';
import { useApp, flushPersist } from './store';
import { kvGet, kvSet } from '../lib/kv';
import { TRAINING_PROGRESS_KEY, setTrainingGuard } from '../lib/trainingGuard';
import { applyInjections, buildSandbox, declineCodeOf, declinesOf, takeSnapshot, trainingBlocker, type Swap } from '../lib/trainingSandbox';
import { resetTrainingTerminal, setDeclines, setManualCard } from '../lib/trainingTerminal';
import { resetCheckout } from '../lib/trainingProbe';
import { capturePracticeOrders, resetPracticeOrders, restorePracticeOrders } from '../lib/trainingOrders';
import { capturePracticeGifts, resetPracticeGifts, restorePracticeGifts } from '../lib/trainingGifts';
import { passStateOf, resetPass, setPassState } from '../lib/trainingPass';
import { getModule } from '../training';
import { freshHints, nextHint, type HintState } from '../lib/trainingHints';
import { elapsedSecs, finishStage, seeIntro, startRun, type Run } from '../lib/trainingRun';
import { completeModule, emptyProgress, readProgress, recordStage, staffKey, type Progress } from '../lib/trainingProgress';
import type { Gesture, Injection, Stage } from '../lib/trainingModule';
import { setGate } from '../lib/trainingGate';
import type { Rect } from '../lib/trainingGeometry';

/** Everything the overlay and dock need, worked out by the driver (TrainingHost) and drawn by both. */
export type DockView = {
  mode: 'guide' | 'check'; title: string; say: string; rect: Rect | null; next: boolean; reveal: boolean; nudge: boolean;
  hintLevel: number; hintsLeft: number; canSkip: boolean; objective?: string; counter: string; stage: Stage; index: number; total: number;
  /** How many times Hint has been pressed (see Sess.hintPress). In the view so the toast and its pulse change in the same frame as the hint text, and again on a press that adds nothing new. */
  hintPress?: number;
  /** Set when the spot being pointed at is off screen or cut off, and the person has to scroll to reach it. */
  scroll?: { dir: 'up' | 'down'; fully: boolean };
  /** How the cursor reaches the ringed spot: a tap, a swipe, a scroll, a hold. Left out: a tap. */
  gesture?: Gesture;
  /** How many times the pointed-at control is used in a row (the minus button, to take more than one out). Set only when more than one. */
  repeat?: number;
  /** The person types in the ringed area, so touches pass through it and no cursor is drawn (a Step with `typing`). */
  typing?: boolean;
  /** A Next button that is greyed out until the step's `ready` test passes. */
  nextBlocked?: boolean;
  /** Set in Check when the person has gone off course: what happened, and whether to offer starting this part again. */
  stray?: { title: string; say: string; fix: 'undo' | 'restart'; offerRestart: boolean; how: string[]; taught?: { id: string; title: string; done: boolean }; showHow: boolean };
};
type Sess = {
  run: Run | null; sandbox: boolean; hint: HintState; view: DockView | null; progress: Progress; loaded: boolean;
  /** Goes up on every press of Hint, including one at the last rung that changes nothing, so the person always sees the press was heard (the toast pulses on it). Never reset. */
  hintPress: number;
  /** Goes up each time the person asks "how do I do this?" while off course, so the card opens its steps. */
  howNonce: number; openHow: () => void;
  loadProgress: () => Promise<void>;
  begin: (moduleId: string, stage?: Stage) => void;
  setRun: (r: Run) => void;
  startPractice: () => Promise<string | null>;   // returns a message when it cannot start
  inject: (inj: readonly Injection[] | undefined) => void;
  leave: () => void;
  completeStage: () => Run | null;
  pressHint: (goalId: string, ladder: readonly string[]) => void;
  setView: (v: DockView | null) => void;
  patchRun: (f: (r: Run) => Run) => void;
  captureGoalStart: () => void;                  // remember the practice till as a goal began
  restartGoal: (inj: readonly Injection[] | undefined) => boolean;  // put it back exactly as it was
};
let real: Swap | null = null;
let goalStart: Swap | null = null; let goalOrders: ReturnType<typeof capturePracticeOrders> | null = null; let goalGifts: ReturnType<typeof capturePracticeGifts> | null = null;

/** Who plays the customer at the practice terminal for this course (the course's `card` setting; automatic when it says nothing). */
const cardMode = (moduleId: string | undefined): void => setManualCard(!!moduleId && getModule(moduleId)?.card === 'manual');
/** Who is really using the till. During practice the signed in person can be a practice staff member (Casey, Morgan), so progress and "done" ticks must use the real one, held in the snapshot. */
export const realStaffId = (): string | undefined => (real ? real.staffId : useApp.getState().staffId);
export const useTraining = create<Sess>((set, get) => ({
  run: null, sandbox: false, hint: freshHints(), view: null, progress: emptyProgress(), loaded: false, hintPress: 0, howNonce: 0,
  openHow: () => set(s => ({ howNonce: s.howNonce + 1 })),
  loadProgress: async () => { if (get().loaded) return; set({ progress: readProgress(await kvGet(TRAINING_PROGRESS_KEY, null)), loaded: true }); },
  begin: (moduleId, stage = 'info') => set({ run: startRun(moduleId, stage), hint: freshHints(), view: null }),
  setRun: r => set({ run: r, hint: freshHints(), view: null }),
  patchRun: f => { const r = get().run; if (r) set({ run: f(r) }); },
  startPractice: async () => {
    const blocked = trainingBlocker(useApp.getState()); if (blocked) return blocked;
    if (!real) {
      await flushPersist(); // anything still waiting for its 400 ms timer is written now, so no timer can fire inside the sandbox
      real = takeSnapshot(useApp.getState()); setTrainingGuard(true);
    }
    resetTrainingTerminal(); resetPass(); resetCheckout(); resetPracticeOrders(); resetPracticeGifts(); cardMode(get().run?.moduleId); const m = getModule(get().run?.moduleId ?? ''); useApp.setState(buildSandbox(real, { practiceStaff: m?.practiceStaff, stock: m?.stock })); set({ sandbox: true, hint: freshHints(), view: null });
    const r = get().run; if (r) set({ run: seeIntro(r) });
    return null;
  },
  inject: inj => {
    if (!real) return; const s = useApp.getState();
    useApp.setState(applyInjections(takeSnapshot(s), inj)); setDeclines(declinesOf(inj), declineCodeOf(inj)); setPassState(passStateOf(inj));
  },
  leave: () => {
    goalStart = null; goalOrders = null; goalGifts = null; setGate(null);
    if (real) { const back = real; real = null; useApp.setState(back); setTrainingGuard(false); resetTrainingTerminal(); resetPass(); resetCheckout(); resetPracticeOrders(); resetPracticeGifts(); } // restore first, then drop the guard
    set({ sandbox: false, view: null });
  },
  completeStage: () => {
    const run = get().run; if (!run) return null; const who = staffKey(realStaffId());
    let p = recordStage(get().progress, who, run.moduleId, run.stage);
    if (run.stage === 'check2') p = completeModule(p, who, run.moduleId, { hints: run.hints, secs: elapsedSecs(run) });
    set({ progress: p }); void kvSet(TRAINING_PROGRESS_KEY, p);
    const next = finishStage(run); const r: Run = { ...next, introSeen: false }; set({ run: r, hint: freshHints(), view: null }); return r;
  },
  pressHint: (goalId, ladder) => set(s => ({ hint: nextHint(s.hint, goalId, ladder), hintPress: s.hintPress + 1, run: s.run ? { ...s.run, hints: s.run.hints + 1 } : s.run })),
  setView: v => set({ view: v }),
  captureGoalStart: () => { goalStart = takeSnapshot(useApp.getState()); goalOrders = capturePracticeOrders(); goalGifts = capturePracticeGifts(); },
  restartGoal: inj => {
    if (!goalStart) return false;
    resetTrainingTerminal(); resetCheckout(); if (goalOrders) restorePracticeOrders(goalOrders); if (goalGifts) restorePracticeGifts(goalGifts); cardMode(get().run?.moduleId); useApp.setState(goalStart); setDeclines(declinesOf(inj), declineCodeOf(inj)); setPassState(passStateOf(inj)); set({ hint: freshHints(), view: null }); return true;
  },
}));
export const isPractising = (): boolean => real !== null;
