// Location: src/lib/trainingHints.ts
// The hint ladder for Check stages. Each press of Hint goes one rung up: pointer, more specific, ..., then the answer is shown.
export type HintState = { goal: string; level: number };
export const freshHints = (goal = ''): HintState => ({ goal, level: 0 });
/** Press Hint. A different goal starts again from the bottom. The level stops one past the last written hint (= reveal). */
export function nextHint(st: HintState, goalId: string, ladder: readonly string[]): HintState {
  const level = st.goal === goalId ? st.level : 0;
  return { goal: goalId, level: Math.min(level + 1, ladder.length + 1) };
}
export type HintView = { level: number; text?: string; reveal: boolean; left: number };
export function hintView(st: HintState, goalId: string, ladder: readonly string[]): HintView {
  const level = st.goal === goalId ? st.level : 0;
  if (level === 0) return { level, reveal: false, left: ladder.length };
  if (level > ladder.length) return { level, reveal: true, text: 'Here it is. Tap the highlighted spot.', left: 0 };
  return { level, text: ladder[level - 1], reveal: false, left: ladder.length - level };
}
/** After this long with no touch and no hint used, the dock gently points at the Hint button. */
export const NUDGE_AFTER_MS = 40_000;
export const shouldNudge = (idleMs: number, level: number): boolean => level === 0 && idleMs >= NUDGE_AFTER_MS;
/** How many hints the person actually used on a goal (the reveal counts as one). */
export const hintsUsed = (st: HintState, goalId: string): number => (st.goal === goalId ? st.level : 0);
