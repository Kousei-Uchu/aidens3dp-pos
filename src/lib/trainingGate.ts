// Location: src/lib/trainingGate.ts
// What the person may touch inside the ringed box during a Guide step (B6). TrainingHost sets it each step; the screens ask it before acting on a tap
// that is not itself the thing the step wants. With no Guide step running there is no gate and everything works as normal. Pure rule in pointerGesture.ts.
import { tapAllowed, type Gate } from './pointerGesture';

let gate: Gate = null;
export const setGate = (g: Gate): void => { gate = g; };
export const currentGate = (): Gate => gate;
/** May a plain tap act on this control? A swipe or scroll step says no to every tap, so the thing under the ring cannot be opened by accident. */
export const gateAllowsTap = (spot?: string): boolean => tapAllowed(gate, spot);
