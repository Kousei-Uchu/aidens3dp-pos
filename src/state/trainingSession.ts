// Location: src/state/trainingSession.ts
// The training session: which course run is open, the practice-data swap, hints, and what the overlay should draw.
// The swap keeps the real state in memory only. Nothing real is changed on disk, so a crash mid-training just reopens the normal till.
import { create } from 'zustand';
import { useApp, flushPersist } from './store';
import { kvGet, kvSet } from '../lib/kv';
import { TRAINING_PROGRESS_KEY, setTrainingGuard } from '../lib/trainingGuard';
import { applyInjections, buildSandbox, declinesOf, takeSnapshot, trainingBlocker, type Swap } from '../lib/trainingSandbox';
import { resetTrainingTerminal, setDeclines } from '../lib/trainingTerminal';
import { freshHints, nextHint, type HintState } from '../lib/trainingHints';
import { elapsedSecs, finishStage, seeIntro, startRun, type Run } from '../lib/trainingRun';
import { completeModule, emptyProgress, readProgress, recordStage, staffKey, type Progress } from '../lib/trainingProgress';
import type { Injection, Stage } from '../lib/trainingModule';
import type { Rect } from '../lib/trainingGeometry';

/** Everything the overlay and dock need, worked out by the driver (TrainingHost) and drawn by both. */
export type DockView = {
  mode: 'guide' | 'check'; title: string; say: string; rect: Rect | null; next: boolean; reveal: boolean; nudge: boolean;
  hintLevel: number; hintsLeft: number; canSkip: boolean; objective?: string; counter: string; stage: Stage; index: number; total: number;
  /** Set in Check when the person has gone off course: what happened, and whether to offer starting this part again. */
  stray?: { title: string; say: string; fix: 'undo' | 'restart'; offerRestart: boolean; how: string[]; taught?: { id: string; title: string; done: boolean }; showHow: boolean };
};
type Sess = {
  run: Run | null; sandbox: boolean; hint: HintState; view: DockView | null; progress: Progress; loaded: boolean;
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
let goalStart: Swap | null = null;

export const useTraining = create<Sess>((set, get) => ({
  run: null, sandbox: false, hint: freshHints(), view: null, progress: emptyProgress(), loaded: false, howNonce: 0,
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
    resetTrainingTerminal(); useApp.setState(buildSandbox(real)); set({ sandbox: true, hint: freshHints(), view: null });
    const r = get().run; if (r) set({ run: seeIntro(r) });
    return null;
  },
  inject: inj => {
    if (!real) return; const s = useApp.getState();
    useApp.setState(applyInjections(takeSnapshot(s), inj)); setDeclines(declinesOf(inj));
  },
  leave: () => {
    goalStart = null;
    if (real) { const back = real; real = null; useApp.setState(back); setTrainingGuard(false); resetTrainingTerminal(); } // restore first, then drop the guard
    set({ sandbox: false, view: null });
  },
  completeStage: () => {
    const run = get().run; if (!run) return null; const who = staffKey(useApp.getState().staffId);
    let p = recordStage(get().progress, who, run.moduleId, run.stage);
    if (run.stage === 'check2') p = completeModule(p, who, run.moduleId, { hints: run.hints, secs: elapsedSecs(run) });
    set({ progress: p }); void kvSet(TRAINING_PROGRESS_KEY, p);
    const next = finishStage(run); const r: Run = { ...next, introSeen: false }; set({ run: r, hint: freshHints(), view: null }); return r;
  },
  pressHint: (goalId, ladder) => set(s => ({ hint: nextHint(s.hint, goalId, ladder), run: s.run ? { ...s.run, hints: s.run.hints + 1 } : s.run })),
  setView: v => set({ view: v }),
  captureGoalStart: () => { goalStart = takeSnapshot(useApp.getState()); },
  restartGoal: inj => {
    if (!goalStart) return false;
    resetTrainingTerminal(); useApp.setState(goalStart); setDeclines(declinesOf(inj)); set({ hint: freshHints(), view: null }); return true;
  },
}));
export const isPractising = (): boolean => real !== null;
