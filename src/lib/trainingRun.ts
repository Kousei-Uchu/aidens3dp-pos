// Location: src/lib/trainingRun.ts
// The run state machine: info, show, guide, check 1, check 2, done. Modules are never locked, but inside one module the stages go in order.
import { STAGES, needsSandbox, type Stage } from './trainingModule';

export type Run = { moduleId: string; stage: Stage; introSeen: boolean; startedAt: number; hints: number; skips: number; stepIndex: number; goalIndex: number };
export const startRun = (moduleId: string, stage: Stage = 'info', now = Date.now()): Run => ({ moduleId, stage, introSeen: false, startedAt: now, hints: 0, skips: 0, stepIndex: 0, goalIndex: 0 });
export const stageIndex = (s: Stage): number => STAGES.indexOf(s);
/** The furthest stage a person may open: the one after their last finished stage. Finished stages can always be replayed. */
export function canOpenStage(done: readonly Stage[], s: Stage): boolean {
  const best = done.reduce((m, d) => Math.max(m, stageIndex(d)), -1);
  return stageIndex(s) <= best + 1;
}
export const nextStage = (s: Stage): Stage | null => STAGES[stageIndex(s) + 1] ?? null;
/** Moves to the next stage and resets the per-stage counters. Returns the same run at the end. */
export function finishStage(r: Run): Run { const n = nextStage(r.stage); return n ? { ...r, stage: n, stepIndex: 0, goalIndex: 0 } : r; }
export const seeIntro = (r: Run): Run => ({ ...r, introSeen: true });
/** True when this run is showing the practice-data card before a sandbox stage. */
export const showsIntro = (r: Run): boolean => needsSandbox(r.stage) && !r.introSeen;
export const useHint = (r: Run): Run => ({ ...r, hints: r.hints + 1 });
export const skipStep = (r: Run): Run => ({ ...r, skips: r.skips + 1, stepIndex: r.stepIndex + 1 });
export const advanceStep = (r: Run, total: number): { run: Run; done: boolean } => (r.stepIndex + 1 >= total ? { run: r, done: true } : { run: { ...r, stepIndex: r.stepIndex + 1 }, done: false });
export const advanceGoal = (r: Run, total: number): { run: Run; done: boolean } => (r.goalIndex + 1 >= total ? { run: r, done: true } : { run: { ...r, goalIndex: r.goalIndex + 1 }, done: false });
/** Whole seconds since the run started, for the recap. */
export const elapsedSecs = (r: Run, now = Date.now()): number => Math.max(0, Math.round((now - r.startedAt) / 1000));
