// Location: src/lib/stepUpGate.ts
// The doorway the screens use: `await requireStepUp('shopify')` before a change that matters. Returns true straight away when no PIN is
// needed (a Register, practice and demo, nobody has a PIN, or a PIN was typed recently) and otherwise shows the PIN prompt.
import { useApp } from '../state/store';
import { useStepUp } from '../state/stepUp';
import { isTraining } from './trainingGuard';
import { readMode } from './appMode';
import { DEFAULT_STEP_UP_MINUTES, STEP_UP_CHOICES, readMinutes, stepUpNeeded, type StepUpAction } from './stepUp';

/** Would a step-up be asked for right now? Synchronous, so navigation can stay instant when the answer is no. */
export function stepUpDue(): boolean {
  if (isTraining()) return false;
  const s = useApp.getState();
  return stepUpNeeded({ companion: readMode(s.settings.appMode) === 'companion', staffCount: s.settings.staff.length, lastPinAt: s.lastPinAt, now: Date.now(), minutes: readMinutes(s.settings.stepUpMinutes, STEP_UP_CHOICES, DEFAULT_STEP_UP_MINUTES) });
}
export async function requireStepUp(action: StepUpAction): Promise<boolean> {
  if (!stepUpDue()) return true;
  return useStepUp.getState().open(action);
}
