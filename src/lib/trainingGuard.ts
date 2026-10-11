// Location: src/lib/trainingGuard.ts
// One flag that says "the till is running on practice data". While it is on, nothing real may be written or sent.
// Every seam that touches storage, Shopify, files or the card reader asks this file first. No imports, so it can be used anywhere.
export const TRAINING_PROGRESS_KEY = 'training.progress.v1';
let on = false;
export const isTraining = (): boolean => on;
export const setTrainingGuard = (v: boolean): void => { on = v; };
/** The only key that may be written during training is the person's own training progress. */
export const kvWriteAllowed = (key: string): boolean => !on || key === TRAINING_PROGRESS_KEY;
export class TrainingBlockedError extends Error { constructor(what: string) { super(`Training mode: ${what} is switched off.`); this.name = 'TrainingBlockedError'; } }
