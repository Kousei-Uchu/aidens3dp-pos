// Location: src/lib/trainingGuard.ts
// One flag that says "the till is running on practice data". While it is on, nothing real may be written or sent.
// Every seam that touches storage, Shopify, files or the card reader asks this file first. No imports, so it can be used anywhere.
//
// There are two ways onto practice data, and both mean the same thing to every seam:
//   - a training course run (B6), started and stopped per run; and
//   - Demo mode (F8), which the person switches on until they leave it.
// `isTraining()` is the question every seam asks, and it is true for either. `isDemo()` is only for the Demo home
// screen and its banner, which need to know the difference.
export const TRAINING_PROGRESS_KEY = 'training.progress.v1';
let on = false;
let demo = false;
/** True while the till is on practice data, whether a training run or Demo mode. */
export const isTraining = (): boolean => on || demo;
/** True only while Demo mode (F8) is on. */
export const isDemo = (): boolean => demo;
export const setTrainingGuard = (v: boolean): void => { on = v; };
/** Demo mode is its own lock, held until the person leaves it; a training run never turns it on or off. */
export const setDemoGuard = (v: boolean): void => { demo = v; };
/** The only key that may be written on practice data is the person's own training progress. */
export const kvWriteAllowed = (key: string): boolean => !isTraining() || key === TRAINING_PROGRESS_KEY;
export class TrainingBlockedError extends Error { constructor(what: string) { super(`Training mode: ${what} is switched off.`); this.name = 'TrainingBlockedError'; } }
