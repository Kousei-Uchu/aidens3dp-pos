// Location: src/ui/trainingActions.ts
// The buttons on the dock and bubble call these. TrainingHost fills them in (it owns navigation), so the overlay never imports it.
export const trainingActions: { next: () => void; hint: () => void; skip: () => void; exit: () => void } = { next: () => {}, hint: () => {}, skip: () => {}, exit: () => {} };
